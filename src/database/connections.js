const mongoose = require('mongoose');

const env = process.env

const uriMongoDB = env.APP_URIMONGODB

const db = mongoose.createConnection(uriMongoDB)

module.exports = {db}