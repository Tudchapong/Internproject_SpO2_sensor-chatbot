const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const tempSchema = new Schema({
    bpm: {
        type: String,
        required: true
    },
    spo2: {
        type: String,
        required: true
    },
    pi: {
        type: String,
        required: true
    }
},{timestamps: true});

const temp_humi = mongoose.model('temp', tempSchema);

module.exports = temp_humi;

