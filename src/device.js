//
//  device.js
//  Sahil Chaddha
//
//  Created by Sahil Chaddha on 30/10/2018.
//  Copyright © 2018 sahilchaddha.com. All rights reserved.
//

const EventEmitter = require('events')
const net = require('net')

class YeeDevice extends EventEmitter {
  constructor(device) {
    super()
    this.id = device.id || 100;
    this.debug = device.debug || false
    this.connected = false
    this.forceDisconnect = false
    this.timer = null
    this.host = device.host
    this.port = device.port
    this.model = device.model // can be undefined
    this.attributes_names = device.attributes || ['power', 'bright', 'rgb', 'flowing', 'flow_params', 'hue', 'sat', 'ct'];
    this.attributes = {}
    for (let index = 0; index < this.attributes_names.length; index++) {
      let att = this.attributes_names[index];
      this.attributes[att] = null;
    }
    this.polligInterval = device.interval || 5000
    this.retry_timer = null
  }

  connect() {
    try {
      this.forceDisconnect = false
      this.socket = new net.Socket()
      this.bind()
      this.socket.connect({ host: this.host, port: this.port }, () => {
        this.didConnect()
        this.emit('connected')
      })
    } catch (err) {
      this.socketClosed(err)
    }
  }

  disconnect(forceDisconnect = true) {
    this.forceDisconnect = forceDisconnect
    this.connected = false
    clearInterval(this.timer)
    this.socket.destroy()
    this.socket = null
    this.emit('disconnected')
    if (this.forceDisconnect && this.retry_timer) clearTimeout(this.retry_timer)
  }

  bind() {
    this.socket.on('data', (data) => {
      this.handleResponse(data)
    })

    this.socket.on('error', (err) => {
      this.emit('socketError', err)
      this.socketClosed(err)
    })

    this.socket.on('end', () => {
      this.emit('socketEnd')
      this.socketClosed()
    })
  }

  socketClosed(err) {
    if (this.forceDisconnect) return

    if (err && this.debug) {
      console.log('Socket Closed :', err)
      console.log('Reconnecting in 5 secs')
    }
    this.disconnect(false)
    if (this.retry_timer) {
      clearTimeout(this.retry_timer)
      this.retry_timer = null
    }
    this.retry_timer = setTimeout(this.connect.bind(this), 5000)
  }

  didConnect() {
    this.connected = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.timer = setInterval(this.sendHeartBeat.bind(this), this.polligInterval)
  }

  merge(arr, brr) {
    for (let i = 0; i < arr.length; i++) {
      obj[arr[i]] = brr[i];
    }
    return obj;
  }

  sendHeartBeat() {
    this.send({
      id: 199,
      method: 'get_prop',
      params: this.attributes_names,
    })
  }

  handleResponse(data) {
    const dataArray = data.toString('utf8').split('\r\n')
    dataArray.forEach((dataString) => {
      if (dataString.length < 1) return
      try {
        const response = JSON.parse(dataString)
        if(response.id == 199) {
          if(response.length == this.attributes.length) {
            for (let index = 0; index < this.attributes_names.length; index++) {
              this.attributes[this.attributes_names[index]] = response.result[index];
            }
            this.emit('update', this.attributes, this)
          }
        } else {
          this.emit('response', response, this)
        }
      } catch (err) {
        console.log(err, dataString)
      }
    })
  }

  sendCommand(method, params, id = -1) {
    let msg = {
      "id": id,
      "method": method,
      "params": params
    };
    this.send(msg);
  }

  send(data) {
    const cmd = JSON.stringify(data)
    if (this.connected && this.socket) {
      try {
        this.socket.write(cmd + '\r\n')
      } catch (err) {
        this.socketClosed(err)
      }
    }
  }

  update(device) {
    for(let key in device) {
      this[key] = device[key];
    }
  }
}

module.exports = YeeDevice
