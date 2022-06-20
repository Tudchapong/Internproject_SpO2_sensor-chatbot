/**
 * A BLE client example that is rich in capabilities.
 * There is a lot new capabilities implemented.
 * author unknown
 * updated by chegewara
 */

#include "BLEDevice.h"
#include "StopWatch.h"
#include "Magellan_SIM7020E.h"

Magellan_SIM7020E magel;

//data payload
String payload;

// The remote service we wish to connect to.
static BLEUUID serviceUUID("0000fff0-0000-1000-8000-00805f9b34fb");
// The characteristic of the remote service we are interested in.
static BLEUUID    charUUID("0000fff1-0000-1000-8000-00805f9b34fb");
// The address 
static BLEAddress bluedot("00:1c:c2:55:ff:d0");

//flag doing connecting
static boolean doConnect = false;
//flag connected
static boolean connected = false;
//flag scanning device
static boolean doScan = false;
//characteristic of device
static BLERemoteCharacteristic* pRemoteCharacteristic;
//advertised of device
static BLEAdvertisedDevice* myDevice;

//value that will push to magellan 
int bpm;
int spo2;
float pi;

//data that sent from sensor in pData array
static void notifyCallback(
  BLERemoteCharacteristic* pBLERemoteCharacteristic,
  uint8_t* pData,
  size_t length,
  bool isNotify) {
  //corrected value that match with sensor screen pData[2] must equal 129
  if (pData[2] == 0x81) {
    bpm = pData[4];
    spo2 = pData[3];
    pi = pData[8]*0.2588;
  }
}

//check connection of device
class MyClientCallback : public BLEClientCallbacks {
  void onConnect(BLEClient* pclient) {
  }

  void onDisconnect(BLEClient* pclient) {
    connected = false;
    Serial.println("onDisconnect");
  }
};

//connect to spo2 sensor
bool connectToServer() {
    Serial.print("Forming a connection to ");
    Serial.println(myDevice->getAddress().toString().c_str());
    
    BLEClient*  pClient  = BLEDevice::createClient();
    Serial.println(" - Created client");

    //client call MyClinetCallback for chenking connection
    pClient->setClientCallbacks(new MyClientCallback());

    // Connect to the remove BLE Server.
    pClient->connect(myDevice);  // if you pass BLEAdvertisedDevice instead of address, it will be recognized type of peer device address (public or private)
    Serial.println(" - Connected to server");

    // Obtain a reference to the service we are after in the remote BLE server.
    BLERemoteService* pRemoteService = pClient->getService(serviceUUID);
    if (pRemoteService == nullptr) {
      Serial.print("Failed to find our service UUID: ");
      Serial.println(serviceUUID.toString().c_str());
      pClient->disconnect();
      return false;
    }
    Serial.println(" - Found our service");


    // Obtain a reference to the characteristic in the service of the remote BLE server.
    pRemoteCharacteristic = pRemoteService->getCharacteristic(charUUID);
    //if characteristic are null then disconnect 
    if (pRemoteCharacteristic == nullptr) {
      Serial.print("Failed to find our characteristic UUID: ");
      Serial.println(charUUID.toString().c_str());
      pClient->disconnect();
      return false;
    }
    Serial.println(" - Found our characteristic");

    // Read the value of the characteristic.
    if(pRemoteCharacteristic->canRead()) {
      std::string value = pRemoteCharacteristic->readValue();
      Serial.print("The characteristic value was: ");
      Serial.println(value.c_str());
    }

    if(pRemoteCharacteristic->canNotify())
      pRemoteCharacteristic->registerForNotify(notifyCallback);

    connected = true;
}
/**
 * Scan for BLE servers and find the first one that advertises the service we are looking for.
 */
class MyAdvertisedDeviceCallbacks: public BLEAdvertisedDeviceCallbacks {
 /**
   * Called for each advertising BLE server.
   */
  void onResult(BLEAdvertisedDevice advertisedDevice) {
    Serial.print("\nBLE Advertised Device found: ");
    Serial.println(advertisedDevice.toString().c_str());
    
    Serial.print("Address: ");
    Serial.println(advertisedDevice.getAddress().toString().c_str());
    //check service UUID Have?Haven't 
    if (advertisedDevice.haveServiceUUID()) {
      Serial.println("Device has Service UUID");
      if (advertisedDevice.isAdvertisingService(serviceUUID)) {
        Serial.println("Device is advertising our Service UUID");
      }
      else {
        Serial.println("Device is not advertising our Service UUID");
      }
    }
    else {Serial.println("Device does not have Service UUID");}
    
    // found device by using service UUID & address then connect to device
    if ((advertisedDevice.haveServiceUUID() && advertisedDevice.isAdvertisingService(serviceUUID)) || (advertisedDevice.getAddress().equals(bluedot))) {
      //stop searching device
      BLEDevice::getScan()->stop();
      //new device to connect
      myDevice = new BLEAdvertisedDevice(advertisedDevice);
      doConnect = true;
      doScan = true;

    } // Found our server
  } // onResult
}; // MyAdvertisedDeviceCallbacks

void setup() {
  Serial.begin(115200);
  BLEDevice::init("");
  // Retrieve a Scanner and set the callback we want to use to be informed when we
  // have detected a new device.  Specify that we want active scanning and start the
  // scan to run for 300 seconds.
  BLEScan* pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setInterval(1349);
  pBLEScan->setWindow(449);
  pBLEScan->setActiveScan(true);
  pBLEScan->start(300, false);

  //start magellan
  magel.begin(); 

  //create task 
  xTaskCreate(TaskBLEscan,"Taskscan",2048,NULL,0,NULL); 
  xTaskCreate(Taskmagellan,"Taskmagellan",8192,NULL,1,NULL);  
} // End of setup.

void TaskBLEscan(void *pvParameters){
    (void) pvParameters;
  
    // If the flag "doConnect" is true then we have scanned for and found the desired
    // BLE Server with which we wish to connect.  Now we connect to it.  Once we are 
    // connected we set the connected flag to be true.
    for(;;){
      if (doConnect == true) {
        Serial.println("Starting Arduino BLE Client application...");
        if (connectToServer()) {
          Serial.println("We are now connected to the BLE Server.");
        } else {
          Serial.println("We have failed to connect to the server; there is nothin more we will do.");
        }
        doConnect = false;
      }
    
      // If we are connected to a peer BLE Server, update the characteristic each time we are reached
      // with the current time since boot.
      if (connected) {
        String newValue = "Time since boot: " + String(millis()/1000);
        //Serial.println("Setting new characteristic value to \"" + newValue + "\"");
        
        // Set the characteristic's value to be the array of bytes that is actually a string.
        pRemoteCharacteristic->writeValue(newValue.c_str(), newValue.length());
      }else if(doScan){
        BLEDevice::getScan()->start(0);  // this is just eample to start scan after disconnect, most likely there is better way to do it in arduino
      }
      vTaskDelay(100 / portTICK_PERIOD_MS);
  }
}

void Taskmagellan(void *pvParameters){
  (void) pvParameters;
  for(;;){
    String blood = String(bpm);
    String oxy = String(spo2);
    String p_index = String(pi);
  
    //if sensor have value(sensor still working) then send to magellan
    if(blood != "0" || oxy != "0"){
        
        //data payload<string> push to magellan
        payload = "{\"bpm\":"+blood+",\"spo2\":"+oxy+",\"pi\":"+p_index+"}";
        
        //push data payload to magellan
        magel.report(payload);
        
        //delay sending data for 5 sec
        vTaskDelay(5000 / portTICK_PERIOD_MS);
    }
  }
}

// This is the Arduino main loop function.
void loop() {
  
} // End of loop
