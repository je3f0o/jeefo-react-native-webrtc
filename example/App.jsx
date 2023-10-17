import {useState, useEffect} from 'react';
import {
  View,
  Text,
  Button,
  Platform,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {RTCView} from 'react-native-webrtc';
import Signaller from 'jeefo-react-native-webrtc';

const CustomButton = ({ onPress, text, style }) => {
  const btn_style = [
    { ...styles.btn },
    Platform.OS === 'android' ? { elevation: 3 } : styles.btn_shadow,
    style,
  ];
  return (
    <TouchableOpacity style={btn_style} onPress={onPress}>
      <Text style={styles.btn_text}>{text}</Text>
    </TouchableOpacity>
  );
};

export default function App() {
  const [vc             , set_vc]       = useState(null);
  const [audio          , set_audio]    = useState(true);
  const [video          , set_video]    = useState(true);
  const [state          , set_state]    = useState(null);
  const [stream         , set_stream]   = useState(null);
  const [is_speaker     , set_speaker]  = useState(false);
  const [inbound_stats  , set_inbound]  = useState('');
  const [outbound_stats , set_outbound] = useState('');

  const answer  = () => { vc.answer();  };
  const decline = () => { vc.decline(); };
  const call = () => {
    let username = "jeefo";
    switch (Platform.OS) {
      case "ios":
        username += "-android";
        break;
      case "android":
        username += "-ios";
        break;
    }
    vc.call(username);
  };

  const toggle_audio = () => {
    const new_value = !audio;
    vc.set({audio: new_value});
    set_audio(new_value);
  };
  const toggle_video = () => {
    const new_value = !video;
    vc.set({video: new_value});
    set_video(new_value);
  };

  useEffect(() => {
    const signaller = new Signaller();
    //signaller.debug = true;

    signaller.on("connected", () => {
      const _vc = signaller.attach("video_call");

      _vc.on("ready", () => {
        _vc.register(`jeefo-${Platform.OS}`);
      });

      _vc.on("event", e => {
        switch (e.type) {
          case "registered":
            set_state("call");
            break;
          case "calling":
            set_state("calling");
            break;
          case "hangup":
            set_stream(null);
            set_state("call");
            break;
          case "accepted":
            set_state("in_call");
            break;
          case "incoming_call":
            set_state("incoming_call");
            break;
          default:
            console.warn("Unhandled event:", e);
        }
      });

      _vc.on("stream", set_stream);

     _vc.on("update_stats", stats => {
        const in_res      = stats.incoming_video_resolution;
        const in_kbps     = stats.incoming_kbps;
        const in_res_text = `${in_res.width}x${in_res.height}`;
        set_inbound(`Inbound: ${in_res_text}, ${in_kbps}kbps`);

        const out_res      = stats.outgoing_video_resolution;
        const out_kbps     = stats.outgoing_kbps;
        const out_res_text = `${out_res.width}x${out_res.height}`;
        set_outbound(`Outbound: ${out_res_text}, ${out_kbps}kbps`);
      });

      _vc.on("error", err => console.error(err));

      set_vc(_vc);
    });

    signaller.init(/* url */);

    return () => signaller.destroy();
  }, []);

  let view;
  switch (state) {
    case null:
      view = <View style={styles.text}>
        <Text style={{fontSize: 18}}>Registering...</Text>
      </View>;
      break;
    case "call":
      view = <View style={styles.grow}>
        <CustomButton onPress={call} text="Call" style={{backgroundColor: "red"}} />
      </View>;
      break;
    case "in_call":
      view = <View style={styles.grow}>
        <View style={styles.vert}>
          <Text style={{fontSize: 14}}>{inbound_stats}</Text>
          <Text style={{fontSize: 14}}>{outbound_stats}</Text>
          <View style={{height: 8}} />
          <View style={styles.horz}>
            <View style={styles.grow}>
              <CustomButton text={audio ? "Disable Audio" : "Enable Audio"}
                style={{backgroundColor: audio ? "red" : "#0336FF"}}
                onPress={toggle_audio} />
            </View>
            <View style={{width: 8}} />
            <View style={styles.grow}>
              <CustomButton text={audio ? "Disable Video" : "Enable Video"}
                style={{backgroundColor: video ? "red" : "#0336FF"}}
                onPress={toggle_video} />
            </View>
          </View>
          <View style={{height: 8}} />
          <View style={styles.grow}>
            <CustomButton text="Decline"
              style={{backgroundColor: "red"}}
              onPress={decline} />
          </View>
        </View>
      </View>;
      break;
    case "calling":
      view = <View style={styles.text}>
        <Text style={{fontSize: 18}}>Calling...</Text>
      </View>;
      break;
    case "incoming_call":
      view = <>
        <View style={styles.grow}>
          <CustomButton text="Answer"
            style={{backgroundColor: "green"}}
            onPress={answer} />
        </View>
        <View style={{width: 16}} />
        <View style={styles.grow}>
          <CustomButton text="Decline"
            style={{backgroundColor: "red"}}
            onPress={decline} />
        </View>
      </>;
      break;
  }

  return (
    <View style={styles.body}>
      {
        stream && <RTCView
          streamURL={stream.toURL()}
          style={styles.stream} />
      }
      <View style={styles.btns}>{view}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    backgroundColor: "gray",
    ...StyleSheet.absoluteFill
  },
  stream: {
    flex: 1,
  },
  text: {
    flexGrow: 1,
    alignItems: "center",
  },
  vert: {
    flexDirection: 'column',
  },
  horz: {
    flexDirection: 'row',
  },
  grow: {
    flexGrow: 1,
  },
  btn: {
    padding         : 12,
    borderRadius    : 8,
    backgroundColor : "#2196F3",
  },
  btn_shadow: {
    shadowColor   : "black",
    shadowOffset  : { width  : 0, height : 4 },
    shadowOpacity : 0.3,
    shadowRadius  : 3,
  },
  btn_text: {
    color         : "white",
    fontSize      : 14,
    fontFamily    : "Arial",
    fontWeight    : "900",
    textAlign     : "center",
    textTransform : "uppercase",
  },
  btns: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    flexDirection: 'row',
  },
});