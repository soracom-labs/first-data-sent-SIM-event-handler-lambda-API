# first-data-sent-SIM-event-handler-lambda-API
FIRST SIM CONNECTION-TRIGGER SMS WITH EVENT HANDLER TO PROVISION DEVICE
In this blog, we will learn how to send an SMS to a device equipped with a Soracom SIM upon its first connection by using an execute web request or a AWS Lambda invocation from the Soracom Event Handler service. Event Handler provides an automated response to a set of rules created by the operator, allowing us to use a defined rule to detect when a SIM card first sends data over the LTE network and trigger a rule to send back device- and network-specific information, as well as configuration settings, to the cellular IoT device via SMS.

This process will benefit those customers that need to send APN and configuration information to a device once it becomes active. In this instance specifically, this process will outline how to send AT$GPRS=APF427,1,"soracom.io","sora","sora"  (The AT command for configuring an APN may be different for your device and that you should consult your device's AT command guide)

The Cloud components that will be used in this process are;

Soracom Event Handler has the ability to detect the first connection of a SIM, and then either execute a web request or invoke a service such as Lambda.
AWS Lambda will run the appropriate code to log into the Soracom API and send the parameter from Event Handler, which will provision the information.
Soracom API will receive the command to send an SMS to the device with a SIM.




STEPS

Configuring Event Handler. 

Here is how I configured Event Handler to use a Lambda invocation. It requires an AWS IAM role with a unique access key and secret, which is configured in the credentials store of the Soracom console.  The reason this is needed is because Soracom and AWS’s security rules require that a user is allowed to uses those AWS services.






For Event Handler, you will also have to configure a parameter and value to send to the Lambda.  This is where you set the data to be sent to Lambda which in turn is sent to the Soracom API to send an SMS to the device with the proper configuration settings. 



Link to the available Variables for Event Handler parameters.   This is where you set the variables/configurations you want to send over SMS to the device for it’s provisioning.




Generate the API Key and Token

You'll want to create a SAM user with programmatic access that has the right permission for the Soracom API you want to execute, then generate a set of AuthKeys for that user. Then, in the Lambda, you need to set AUTH_KEY and AUTH_KEY_ID environment variables accordingly. We'll call the API using our Soracom AUTH_KEY and AUTH_KEY_ID for authentication:  Here is a link on how to configure the credential store for accessing the Soracom API. 
The auth_keys can also be generated in console



Option 1
If your Event Handler action is to Invoke AWS Lambda, you'll also need to set up an AWS IAM user with permission to execute Lambda, and then a set of AWS IAM Access Key and Secret, which will be registered to the Event Handler action.
	
Option 2
You can alternatively use the new AWS Lambda Function URL option to invoke the Lambda via an HTTPS call (using Event Handler Webhook action instead), but you will have to implement your own authentication to prevent unauthorized parties from arbitrarily executing your function URL. 
 
How to set up a webhook in Lambda


Notes:  
In the production code, you should to avoid passing credentials (i.e. AUTH_KEY and AUTH_KEY_ID) through the environment variables as plain text. We recommend using AWS Secrets Manager instead.
Additionally, there are a couple things you might want to keep in mind whether you want to include this in your tes or nott.
Users currently do not have any way to know if their SMS was not delivered (such as if the device was offline). If you set up Harvest in Soracom, however, you can see if the SMS was delivered if your device sends a SMS response back.
If the purpose of the SMS is to send an APN configuration command to a device, then - at a high level - this is the expected behavior:
Before sending SMS: No APN is set, so the device can't create a data session. When it attaches to a network, however, the status will change from ‘Ready’ to ‘Active,’ which is what we use to trigger the SMS.
After sending SMS: The APN is set, so the device should be able to create a data session.

There is an alternative way to check the SMS delivery status according to whether or not the device eventually successfully creates a data session (implying the SMS delivery was successful).  
This may increase the complexity of the Lambda, but this is the general idea:
Using a Lambda, when a SIM status changes from ‘Ready’ to ‘Active’ (using Event Handler SIM Status rule), send the SMS and move the SIM to Group 1.
Any SIMs that successfully receive the SMS and create a session will move into and out of Group 1, while SIMs that were sent an SMS but never came online (such as when the device is offline and never received the SMS) would be stuck in Group 1, which makes it easier to identify which devices need to be fixed.
Here is the JavaScript Code for Lambda that allows you to log into the Soracom API and send an SMS to your device for SMS provisioning based on the parameter you set based on a rule of first data sent using Event Handler.


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

