'use strict';
//import librarys
const timeout = require('connect-timeout')
const line = require('@line/bot-sdk');
const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bodyParser = require('body-parser'); 
const temp_humi = require('./module/temp&hu')
const mag = require('./module/magdata')
// listen on port
const port = process.env.PORT || 3000;
require('dotenv').config('/.env')

// create LINE SDK config from env variables
const config = {
  channelAccessToken: process.env.ACCESS_TOKEN,
  channelSecret: process.env.SECRET_TOKEN
};

//connected to mongoose
mongoose.connect(process.env.DB_URI,{ useNewUrlParser: true, useUnifiedTopology: true})  
  .then((result) => console.log(result))
  .catch((err) => console.log(err));

let i=0;                  //check state on register
let check = 0;            //view spo2,bpm,pi
let createAc = 0;         //create account
let ids;                  //get user id
let name;                 //get user name
let s_bpm,s_spo2,s_pi;    //the newest streaming data form mags collection

// create LINE SDK client
const client = new line.Client(config); 

// create Express app
// about Express itself: https://expressjs.com/
const app = express();

//handle timeout request form magellan
function handleTimeOut (req,res,next){
  if(!req.timeout) next()
}

//web for streaming data collect in DB ,if req over 5s then timeout and go to next req
app.post('/', timeout('5s'), bodyParser.json(), handleTimeOut, (req, res, next) => {
  
  //push new data from magellan to DB
  const h_data = new mag({
    bpm: req.body.Sensors.bpm,
    spo2: req.body.Sensors.spo2,
    pi: req.body.Sensors.pi
  });
  h_data.save()
  
  //get the newest data
  mag.findOne({}).sort([['createdAt',-1]]).exec(function(err,data){
    s_bpm = data.bpm
    s_spo2 = data.spo2
    s_pi = data.pi
  })
})

// register a webhook handler with middleware
// about the middleware, please refer to doc
app.post('/callback', line.middleware(config), async (req, res) => {
  try{
    const events = req.body.events
    if(events.length > 0){
      return await events.map(item => handleEvent(item))
    }
    else{
      res.status(200).send("OK")
    }
  }
  catch(err){
    console.log(err)
  }
});

// event handler
const handleEvent = async (event) => {
  //type of input does not match 
  if (event.type !== 'message' || event.message.type !== 'text') {
    // ignore non-text-message event
    return null;
  }

  //input with name to check data in DB 
  temp_humi.findOne({uname: event.message.text}, (err,data) =>{
    if(err){
      console.log(err)
    }

    //have name in DB
    if(data){
      check = 1;              //set to view SpO2 mode 
      createAc = 0;           //set does not create account mode
      ids = data.uid;         //using for mapping data by id
      name = data.uname;      //using for mapping data by name
      const echo = { type: 'text', text: 'ID: ' + data.uid + '\nชื่อ: ' + data.uname};    //reply message
      return client.replyMessage(event.replyToken, echo);          //send reply message
    }

    //view SpO2 mode
    if(!data && check){
      var myquery = {uid: ids};         //choose user for store SpO2 value mapping by id
      var newvalue = {$set: {           //new SpO2,bpm,pi value
        bpm: s_bpm,
        spo2: s_spo2,
        pi: s_pi
      }}
      //find user to store SpO2, bpm, pi mapping by uid
      temp_humi.findOneAndUpdate(myquery, newvalue, function(err, data){
        if(err) throw err;
        //user typing "T" then show SpO2, bpm, pi value by reply message
        if(event.message.text == 'T'){
          const echo = { type: 'text', text: 'ค่า BPM,SpO2 และ PI ของคุณ\nBPM:' + data.bpm + '\nSpO2:' + data.spo2 + '\nPI: ' + data.pi};
          return client.replyMessage(event.replyToken, echo);
        }
        //user typing "E" then reset "check" to exit view data mode
        if(event.message.text == 'E'){
          check = 0;
          createAc = 0;
          console.log("exit")
          const echo = { type: 'text', text: 'ออกจากระบบ'};
          return client.replyMessage(event.replyToken, echo);
        }
        //input that isn't "T" or "E" 
        else{
          console.log("incorrect input");
          const echo = { type: 'text', text: 'กรุณาพิมพ์ "T" เพื่อดูค่า BPM และSpO2 หรือพิมพ์ "E" เพื่อออกจากโหมด'};
          return client.replyMessage(event.replyToken, echo);
        }
      })
    }

    //check name that user input doesn't have in DB then prepare for register username
    if(!data && !check && !createAc){
      createAc = 1;
      console.log("no account")
      const echo = { type: 'text', text: 'ไม่พบบัญชีของคุณ กรุณาพิมพ์ชื่อของคุณอีกครั้งเพื่อลงทะเบียน'};
      return client.replyMessage(event.replyToken, echo);
    }

    //register mode
    if(createAc && !data && !check){      
      //start with get username
      if(i==0){
        //insert new user to DB
        const newuser = new temp_humi({
          //generate uid
          uid: Math.floor(Math.random() * 9999) + 1000,
          uname: event.message.text,
          gender: 0,
          age: 0,
          weight: 0,
          height: 0,
          con_disease: 0,
          bpm: 0,
          spo2: 0,
          pi: 0
        });
        newuser.save()
        console.log(newuser)
        ids = newuser.uid
        const echo1 = { type: 'text', text: 'ID ของคุณ คือ ' + newuser.uid + '\nกรุณาระบุเพศของคุณ'};
        i=1
        return client.replyMessage(event.replyToken, echo1);
      }
      //get gender
      else if(i==1){
        temp_humi.findOne({uid: ids},(err,data) =>{
          var myquery = {uid: ids};
          var newvalue = {$set: {
            gender: event.message.text
          }}
          temp_humi.updateOne(myquery, newvalue, function(err, res){
            if(err) throw err;
            if(event.message.text != '0'){
              const echo1 = { type: 'text', text: 'กรุณาระบุอายุของคุณ'};
              i=2
              return client.replyMessage(event.replyToken, echo1);
            }
          })
        })
      }
      //get age
      else if(i==2){
        temp_humi.findOne({uid: ids},(err,data) =>{
          var myquery = {uid: ids};
          var newvalue = {$set: {
            age: event.message.text
          }}
          temp_humi.updateOne(myquery, newvalue, function(err, res){
            if(err) throw err;
            if(event.message.text != '0'){
              const echo1 = { type: 'text', text: 'กรุณาระบุน้ำหนักของคุณ'};
              i=3
              return client.replyMessage(event.replyToken, echo1);
            }
          })
        })
      }
      //get weight
      else if(i==3){
        temp_humi.findOne({uid: ids},(err,data) =>{
          var myquery = {uid: ids};
          var newvalue = {$set: {
            weight: event.message.text
          }}
          temp_humi.updateOne(myquery, newvalue, function(err, res){
            if(err) throw err;
            if(event.message.text != '0'){
              const echo1 = { type: 'text', text: 'กรุณาระบุส่วนสูงของคุณ'};
              i=4
              return client.replyMessage(event.replyToken, echo1);
            }
          })
        })
      }
      //get height
      else if(i==4){
          temp_humi.findOne({uid: ids},(err,data) =>{
            var myquery = {uid: ids};
            var newvalue = {$set: {
              height: event.message.text
            }}
            temp_humi.updateOne(myquery, newvalue, function(err, res){
              if(err) throw err;
              if(event.message.text != '0'){
                const echo1 = { type: 'text', text: 'กรุณาระบุโรคประจำตัวของคุณ'};
                i=5
                return client.replyMessage(event.replyToken, echo1);
              }
            })
          })
      }
      //get congenital disease
      else if(i==5){
        temp_humi.findOne({uid: ids},(err,data) =>{
          var myquery = {uid: ids};
          var newvalue = {$set: {
            con_disease: event.message.text
          }}
          temp_humi.updateOne(myquery, newvalue, function(err, res){
            if(err) throw err;
            if(event.message.text != '0'){
              const echo1 = { type: 'text', text: 'ลงทะเบียนเสร็จสิ้น'};
              i = 0;
              createAc = 0;
              return client.replyMessage(event.replyToken, echo1);
            }
          })
        })
      }
    }
  })
}

app.listen(port, () => {
  console.log(`listening on ${port}`);
});