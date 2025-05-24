const { Schema } = require('mongoose')

module.exports = (connection) => {

    const ApiKeySchema = new Schema({
        key: {type: String},
	    lastUse: {type: Number, required: true, index: true},
	    uses: {type: Number}
    })

    return connection.model('ApiKey', ApiKeySchema, 'api_key');

}