/* MIT License

Copyright (c) 2020 Rickth64

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. */

'use strict'

const acwm = require("./acwm-api.js")

let Service, Characteristic

module.exports = (homebridge) => {
    Service = homebridge.hap.Service
    Characteristic = homebridge.hap.Characteristic
    homebridge.registerAccessory('homebridge-mhacwifi1', 'MH-AC-WIFI-1', MHACWIFI1Accessory)
}

class MHACWIFI1Accessory {
    constructor(log, config) {

        this.log = log
        this.config = config

        this.dataMap = {
            "active": {
                "uid": 1, /* power */
                "mh": function (homekitActiveValue) {
                    let mhActiveValue;
                    switch (homekitActiveValue) {
                        case Characteristic.Active.ACTIVE:
                            mhActiveValue = 1;
                            break;
                        case Characteristic.Active.INACTIVE:
                        default:
                            mhActiveValue = 0;
                            break;
                    }
                    return mhActiveValue;
                },
                "homekit": function (mhActiveValue) {
                    let homekitActiveValue;
                    switch (mhActiveValue) {
                        case 1:
                            homekitActiveValue = Characteristic.Active.ACTIVE;
                            break;
                        case 0:
                        default:
                            homekitActiveValue = Characteristic.Active.INACTIVE;
                            break;
                    }
                    return homekitActiveValue;
                }
            },
            "state": {
                "uid": 2, /* usermode */
                "mh": function (homekitStateValue) {
                    let mhStateValue;
                    switch (homekitStateValue) {
                        case Characteristic.TargetHeaterCoolerState.HEAT:
                            mhStateValue = 1;
                            break;
                        case Characteristic.TargetHeaterCoolerState.COOL:
                            mhStateValue = 4;
                            break;
                        case Characteristic.TargetHeaterCoolerState.AUTO:
                        default:
                            mhStateValue = 0;
                    }
                    return mhStateValue;
                },
                "homekit": function (mhStateValue) {
                    let homekitStateValue;
                    switch (mhStateValue) {
                        case 4: /* cool */
                            homekitStateValue = Characteristic.TargetHeaterCoolerState.COOL;
                            break;
                        case 3: /* fan, no homekit mapping so go for AUTO */
                            homekitStateValue = Characteristic.TargetHeaterCoolerState.AUTO;
                            break;
                        case 2: /* dry, no homekit mapping so go for AUTO */
                            homekitStateValue = Characteristic.TargetHeaterCoolerState.AUTO;
                            break;
                        case 1: /* heat */
                            homekitStateValue = Characteristic.TargetHeaterCoolerState.HEAT;
                            break;
                        case 0: /* auto */
                        default:
                            homekitStateValue = Characteristic.TargetHeaterCoolerState.AUTO;
                            break;
                    }
                    return homekitStateValue;
                }
            },
            "rotationspeed": {
                "uid": 4, /* fanspeed, values are 0, 1, 2, 3, 4 for both platforms */
                "mh": function (homekitRotationSpeedValue) {
                    return homekitRotationSpeedValue;
                },
                "homekit": function (mhRotationSpeedValue) {
                    return mhRotationSpeedValue;
                }
            },
            "thresholdtemperature": {
                "uid": 9,
                "mh": this.hkTempToMhTemp,
                "homekit": this.mhTempToHkTemp
            },
            "temperature": {
                "uid": 10,
                "mh": this.hkTempToMhTemp,
                "homekit": this.mhTempToHkTemp
            },
            "mintemp": {
                "uid": 35,
                "mh": this.hkTempToMhTemp,
                "homekit": this.mhTempToHkTemp
            },
            "maxtemp": {
                "uid": 36,
                "mh": this.hkTempToMhTemp,
                "homekit": this.mhTempToHkTemp
            }
        }

        this.airco = new acwm(config.ip, config.username, config.password)

        this.service = new Service.HeaterCooler(this.config.name)
    }

    getServices() {
        /*
         * The getServices function is called by Homebridge and should return an array of Services this accessory is exposing.
         * It is also where we bootstrap the plugin to tell Homebridge which function to use for which action.
         */

        /* Create a new information service. This just tells HomeKit about our accessory. */
        const informationService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'Mitsubish Heavy Industries')
            .setCharacteristic(Characteristic.Model, 'Some model')
            .setCharacteristic(Characteristic.SerialNumber, '123-456-789')

        /*
         * For each of the service characteristics we need to register setters and getter functions
         * 'get' is called when HomeKit wants to retrieve the current state of the characteristic
         * 'set' is called when HomeKit wants to update the value of the characteristic
         */
        this.service.getCharacteristic(Characteristic.Active)
            .on('get', callback => { this.getValue('active', callback) })
            .on('set', (value, callback) => { this.setValue('active', value, callback) })

        this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .on('get', callback => { this.getValue('state', callback) })

        this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .on('get', callback => { this.getValue('state', callback) })
            .on('set', (value, callback) => { this.setValue('state', value, callback) })

        this.service.getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', callback => { this.getValue('temperature', callback) })

        this.service.getCharacteristic(Characteristic.RotationSpeed)
            .setProps({ "maxValue": 4, "minValue": 0, "minStep": 1 })
            .on('get', callback => { this.getValue('rotationspeed', callback) })
            .on('set', (value, callback) => { this.setValue('rotationspeed', value, callback) })

        this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({ "maxValue": 30, "minValue": 18, "minStep": 1 }) // TODO: get from API
            .on('get', callback => { this.getValue('thresholdtemperature', callback) })
            .on('set', (value, callback) => { this.setValue('thresholdtemperature', value, callback) })

        this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .setProps({ "maxValue": 30, "minValue": 18, "minStep": 1 }) // TODO: get from API
            .on('get', callback => { this.getValue('thresholdtemperature', callback) })
            .on('set', (value, callback) => { this.setValue('thresholdtemperature', value, callback) })

        /* Return both the main service (this.service) and the informationService */
        return [informationService, this.service]
    }

    /*
    * Helpers
    **/

    getValue(datapoint, callback) {
        this.airco.getDataPointValue(this.dataMap[datapoint].uid)
            .then(info => {
                let value = this.dataMap[datapoint].homekit(info.value)
                this.log(`Successfully retrieved value for ${datapoint}`, value)
                callback(null, value)
            })
            .catch(error => {
                this.log(`Error occured while getting value for ${datapoint}`, error)
                callback(error)
            })
    }

    setValue(datapoint, value, callback) {
        this.airco.setDataPointValue(this.dataMap[datapoint].uid, this.dataMap[datapoint].mh(value))
            .then(info => {
                this.log(`Successfully set value for ${datapoint}`, value)
                callback(null)
            })
            .catch(error => {
                this.log(`Error occured while setting value for ${datapoint} to ${value}`, error)
                callback(error)
            })
    }

    mhTempToHkTemp(mhTemp) {
        let homekitTemperatureValue = parseInt(mhTemp) / 10;
        return homekitTemperatureValue;
    }

    hkTempToMhTemp(hkTemp) {
        let mhTemperatureValue = hkTemp * 10;
        return mhTemperatureValue;
    }
}