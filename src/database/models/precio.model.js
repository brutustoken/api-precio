const { Schema } = require('mongoose')

module.exports = (connection) => {

    const PrecioSchema = new Schema({
        moneda: { type: String, required: true, index: true },
        par: { type: String },
        valor: { type: Number },
        valor_alt: { type: Array },
        date: { type: Date },
        epoch: { type: Number },
        temporalidad: { type: String }
    })

    return connection.model('Precios', PrecioSchema, 'precios');

}