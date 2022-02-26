const {USER_ID_FXP, LOGIN_USERNAME, LOGIN_PASSWORD, SPOTIFY_DETAILS, BACKUP_AVATAR_LINK} = require('./config')
const url           = require('url')
const fetch         = require('node-fetch')
const process       = require('process')
const FormData      = require('form-data')
const SpotifyWebApi = require('spotify-web-api-node')
const spotifyApi    = new SpotifyWebApi(SPOTIFY_DETAILS)
const headers       = {}
const scopes        = ['user-read-playback-state', 'user-read-currently-playing']
let prevSong        = ''

fxpLogin(LOGIN_USERNAME, LOGIN_PASSWORD)

require('http').createServer(function (req, res) {
  if (req.url.startsWith('/callback')) return callback(req, res)
  res.writeHead(302, {'Location': spotifyApi.createAuthorizeURL(scopes)}).end()
}).listen(8888, function() {
  console.log('HTTP Server up. Now go to http://localhost:8888/login in your browser.')
})

function callback(req, res) {
  spotifyApi.authorizationCodeGrant(url.parse(req.url, true).query.code)
  .then(function(data) {
    const {access_token, refresh_token, expires_in} = data.body
    spotifyApi.setAccessToken(access_token)
    spotifyApi.setRefreshToken(refresh_token)
    res.end('Success! You can now close the window.')
    setInterval(async function() {
      const data = await spotifyApi.refreshAccessToken()
      spotifyApi.setAccessToken(data.body['access_token'])  
    }, expires_in / 2 * 1000)
  })
  .catch(error => {
    res.writeHead(302, {'Location': spotifyApi.createAuthorizeURL(scopes)}).end()
  })
}

function parseCookies(response) {
  const raw = response.headers.raw()['set-cookie']
  return raw.map((entry) => {
    const parts = entry.split(';')
    const cookiePart = parts[0]
    return cookiePart
  }).join(';')
}

function fxpLogin(vb_login_username, vb_login_password) {
  const body = new FormData
  body.append('vb_login_username', vb_login_username)
  body.append('vb_login_password', vb_login_password)
  body.append('securitytoken', 'guest')
  body.append('cookieuser', '1')
  body.append('do', 'login')
  fetch('https://www.fxp.co.il/login.php?do=login', {
    method: 'POST', body
  })
  .then(response => {
    headers['Cookie'] = parseCookies(response)
  })
  .catch(error => console.log('error', error))
}

function get_securitytoken() {
  return fetch('https://www.fxp.co.il', {headers})
  .then(response => response.text())
  .then(html => /SECURITYTOKEN = "(.*)";/.exec(html)[1])
}

function uploadImage(fileToUpload) {
  const body = new FormData
  body.append('base', fileToUpload)
  return new Promise(e => fetch('https://profile.fcdn.co.il/imageprofile', { 
      method: 'POST', body
  })
  .then(x => x.json())
  .then(x => e(x.image_link)))
}
async function setProfileImage(profile_url) {
  const body = new FormData
  body.append('do', 'update_profile_pic')
  body.append('profile_url', profile_url)
  body.append('user_id', USER_ID_FXP)
  body.append('securitytoken', await get_securitytoken())
  return new Promise(e => fetch('https://www.fxp.co.il/private_chat.php', { 
    method: 'POST', body, headers
  })
  .then(x => x.text())
  .then(x => 'ok' == x && e()))
}

async function getCurrentSong() {
  try {
    const {body: {item: song}} = await spotifyApi.getMyCurrentPlaybackState()
    if(!song) return
    if(!prevSong) prevSong = song.name
    else if(prevSong == song.name) return
    prevSong = song.name
    const buffer = await (await fetch(song.album.images[1].url)).buffer()
    const imgbs64 = 'data:image/png;base64,'+buffer.toString('base64')  
    setProfileImage(await uploadImage(imgbs64))
    console.log("Updating your profile...")
  } catch (err) {
    console.log('Open your browser at http://localhost:8888/login and come back here.')
  }
}

setInterval(getCurrentSong, 5000)

process.on('SIGINT', async () => {
  if (BACKUP_AVATAR_LINK != '') {
    const buffer = await (await fetch(BACKUP_AVATAR_LINK)).buffer()
    const imgbs64 = 'data:image/png;base64,'+buffer.toString('base64')
    setProfileImage(await uploadImage(imgbs64))
    setTimeout(process.exit, 2000)    
  } else {
    process.exit(1)
  }
})
