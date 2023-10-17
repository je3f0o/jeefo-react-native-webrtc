/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
* File Name   : video_call.js
* Created at  : 2023-10-17
* Updated at  : 2023-10-18
* Author      : jeefo
* Purpose     :
* Description :
* Reference   :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
// ignore:start

/* globals*/
/* exported*/

// ignore:end

import {
  mediaDevices,
  //RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import Logger from 'react-native-webrtc/src/Logger';
import EventEmitter from '@jeefo/utils/event_emitter';

Logger.enable(false);

const iceServers = [
  {
    urls : ["stun:freestun.net:3479"]
  },
  {
    urls : ["stun:freestun.net:5350"]
  },
  {
    urls       : ["turn:freestun.net:3479"],
    username   : "free",
    credential : "free"
  },
  {
    urls       : ["turns:freestun.net:5350"],
    username   : "free",
    credential : "free"
  },
];

const rtc_config = {
  iceServers,
  sdpSemantics       : "unified-plan",
  rtcpMuxPolicy      : "require",
  iceTransportPolicy : "all",
};

export default class VideoCallPlugin extends EventEmitter {
  constructor(signaller) {
    super();

    this.stats = {
      incoming_kbps: 0,
      outgoing_kbps: 0,
      last_incoming_bytes: 0,
      last_outgoing_bytes: 0,
      incoming_video_resolution: {
        width  : 0,
        height : 0,
      },
      outgoing_video_resolution: {
        width  : 0,
        height : 0,
      },
      last_updated: null,
    };
    this.signaller = signaller;

    signaller.send({
      janus       : "attach",
      plugin      : "janus.plugin.videocall",
      session_id  : signaller.session_id,
      transaction : signaller.transaction_id,
    });

    signaller.on("success", msg => {
      if (!this.handler_id && msg.data && msg.data.id) {
        this.handler_id = msg.data.id;
        this.emit("ready");
      }
    });

    this.on("message", (msg, jsep) => {
      if (msg.error) {
        this.emit("error", msg.error);
      } else if (msg.videocall === "event") {
        const e = msg.result;
        switch (e.event) {
          case "accepted":
            if (this.peer && jsep) {
              const remote_sdp = new RTCSessionDescription(jsep);
              this.peer.setRemoteDescription(remote_sdp);
            }
            this.update_stats();
            break;
          case "incomingcall":
            e.event = "incoming_call";
            this.remote_sdp = new RTCSessionDescription(jsep);
            break;
          case "hangup":
            this.remote_sdp = null;
            clearTimeout(this.timeout_id);
            break;
          case "set": return;
        }

        e.type = e.event;
        delete e.event;
        this.emit("event", e);
      } else {
        console.log("VC message:", msg);
      }
    });
  }

  register(username) {
    this.send({request: "register", username});
  }

  async call(username) {
    const pc = await this.create_peer();

    const constraints = {
      OfferToReceiveAudio    : true,
      OfferToReceiveVideo    : true,
      VoiceActivityDetection : true
    };

    const local_sdp = await pc.createOffer(constraints);
    await pc.setLocalDescription(local_sdp);

    this.send({request: "call", username}, local_sdp);
  }

  async answer() {
    if (!this.remote_sdp) {
      throw new Error("VideoCall.answer() method called in wrong state.");
    }
    const pc = await this.create_peer();

    await pc.setRemoteDescription(this.remote_sdp);
    const local_sdp = await pc.createAnswer();
    await pc.setLocalDescription(local_sdp);

    this.send({request: "accept"}, local_sdp);
    this.update_stats();
  }

  decline() {
    this.send({request: "hangup"});
    clearTimeout(this.timeout_id);
  }

  set(request) {
    this.send(Object.assign({}, request, {request: "set"}));
  }

  send(body, jsep) {
    this.signaller.send({
      janus       : "message",
      handle_id   : this.handler_id,
      session_id  : this.signaller.session_id,
      transaction : this.signaller.transaction_id,
      body, jsep,
    });
  }

  update_stats() {
    const timeout = async () => {
      const {
        last_updated,
        last_incoming_bytes,
        last_outgoing_bytes,
      } = this.stats;
      const current_time = new Date();

      for (const report of await this.peer.getStats()) {
        const stat = report[1];
        switch (stat.type) {
          case "inbound-rtp": {
            if (stat.mediaType === "video") {
              const {bytesReceived} = stat;
              if (last_updated) {
                const dt = current_time - last_updated;
                const delta_bytes = bytesReceived - last_incoming_bytes;
                this.stats.incoming_kbps = Math.floor(delta_bytes * 8 / dt);
              }
              const res  = this.stats.incoming_video_resolution;
              res.width  = stat.frameWidth  || 0;
              res.height = stat.frameHeight || 0;
              this.stats.last_incoming_bytes = bytesReceived;
            }
          } break;
          case "outbound-rtp": {
            if (stat.mediaType === "video") {
              const {bytesSent} = stat;
              if (last_updated) {
                const dt = current_time - last_updated;
                const delta_bytes = bytesSent - last_outgoing_bytes;
                this.stats.outgoing_kbps = Math.floor(delta_bytes * 8 / dt);
              }
              const res  = this.stats.outgoing_video_resolution;
              res.width  = stat.frameWidth  || 0;
              res.height = stat.frameHeight || 0;
              this.stats.last_outgoing_bytes = bytesSent;
            }
          } break;
        }
      }
      this.stats.last_updated = current_time;
      this.emit("update_stats", this.stats);

      this.timeout_id = setTimeout(timeout, 1000);
    };
    this.timeout_id = setTimeout(timeout, 1000);
  }

  async create_peer() {
    const peer = new RTCPeerConnection(rtc_config);

    if (this.signaller.debug) {
      peer.addEventListener("negotiationneeded", () => {
        console.debug("On negotiation needed event called.");
      });

      peer.addEventListener("signalingstatechange", () => {
        const state = peer.signalingState;
        console.debug(`On signaling state change: ${state}`);
      });

      peer.addEventListener("iceconnectionstatechange", () => {
        const state = peer.iceConnectionState;
        console.debug(`On ICE connection state change: ${state}`);
      });

      peer.addEventListener("icecandidateerror", ({errorCode, errorText}) => {
        console.error(`On ICE candidate error: ${errorText}`);
      });

      peer.addEventListener("connectionstatechange", async () => {
        console.debug(`On connection state: ${peer.connectionState}`);
      });

      peer.addEventListener("icegatheringstatechange", () => {
        console.debug(`On ICE gathering state change: ${peer.iceGatheringState}`);
      });

      peer.addEventListener("icecandidate", ({candidate}) => {
        console.debug("On ICE candidate:", candidate);
      });
    }

    peer.addEventListener("track", e => {
      this.emit("stream", e.streams[0]);
    });

    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      for (const track of stream.getTracks()) {
        peer.addTrack(track, stream);
      }
    } catch(e) {
      console.error("ERROR in getUserMedia:", e);
    }

    this.peer = peer;
    return peer;
  }
}