const {db} = require('./connections')
const createPrecioModel = require('./models/precio.model')
const createApikeyModel = require('./models/apikey.model')

const Precio = createPrecioModel(db)
const ApiKey = createApikeyModel(db)


module.exports = {
    Precio,
    ApiKey
}