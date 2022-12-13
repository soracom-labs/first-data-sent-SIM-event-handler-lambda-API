/**
 * Environment variables:
 *
 * AUTH_KEY     Soracom API auth key
 * AUTH_KEY_ID  Soracom API auth key ID
 *
 * Parameters from Event Handler:
 * parameter1   SMS message to send to device
 */

const https = require('https')

const soracom = ({
  path,
  method = 'POST',
  headers = { 'Content-Type': 'application/json' },
  body = null,
  success = 200
}) => {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'g.api.soracom.io',
      port: 443,
      path: `/v1${path}`,
      method,
      headers
    }, (res) => {
      if (res.statusCode !== success) reject(`Soracom API ${path} ${res.statusCode} error`)
      res.on('data', (data) => { resolve(JSON.parse(data)) })
    })

    req.on('error', (error) => { reject(error.message) })
    if (body !== null) req.write(JSON.stringify(body))
    req.end()
  })
}

exports.handler = async (event) => {
  try {
    // auth
    const { apiKey, token } = await soracom({
      path: '/auth',
      body: { authKey: process.env.AUTH_KEY, authKeyId: process.env.AUTH_KEY_ID }
    })

    const headers = {
      'X-Soracom-API-Key': apiKey,
      'X-Soracom-Token': token,
      'Content-Type': 'application/json'
    }

    // sendSms
    await soracom({
      path: `/subscribers/${event.imsi}/send_sms`,
      headers,
      body: { payload: event.parameter1, encodingType: 1 },
      success: 202
    })

    

    return `send-SMS for ${event.imsi} completed successfully`
  } catch (error) {
    return `send-SMS for ${event.imsi} failed with error: ${error}`
  }
}
