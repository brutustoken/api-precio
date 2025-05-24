const CryptoJS = require("crypto-js");
const TronWeb = require('tronweb');
var md5 = require('md5');
const env = process.env

function createSecret(user) {

    user = md5(user)
    let secret = getSecret(user)
    console.log({ user, secret })
    return { user, secret }

}

function getSecret(userMd5) {
    let secret = TronWeb.sha3(userMd5 + env.APP_SECRETY)
    secret = (secret.split('0x')[1]).toString(10)
    return secret

}

function decrypData(data, user) {

    try {

        let secret = getSecret(user);
        let bytes = CryptoJS.AES.decrypt(data, secret);
        let decryptedData = bytes.toString(CryptoJS.enc.Utf8);

        return JSON.parse(decryptedData)

    } catch (error) {
        console.log(error)
        return { error: true, msg: "Error on decrypt data" }
    }

}

module.exports = {
createSecret,
decrypData

}