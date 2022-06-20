const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const tempSchema = new Schema({
    uid:{
        type: String,
        required: true
    },
    uname:{                 //case0
        type: String,
        required: true
    },
    gender: {               //case1
        type: String,
        required: true
    },
    age: {                  //case2
        type: String,
        required: true
    },
    weight: {               //case3
        type: String,
        required: true
    },
    height: {               //case4
        type: String,
        required: true
    },
    con_disease: {          //case5
        type: String,
        required: true
    },
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

