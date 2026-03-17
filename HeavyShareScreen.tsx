import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from 'react-native-webrtc';
import { RootStackParamList, Lift } from './types';
import { retrieveLifts } from './utils';

type Props = NativeStackScreenProps<RootStackParamList, 'Heavy'>;

const FIREBASE_BASE =
  'https://liftbook-695fc-default-rtdb.firebaseio.com';

const STUN_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const CHUNK_SIZE = 16_000; // ~16KB per DataChannel message

type Status =
  | 'loading'
  | 'approval'
  | 'connecting'
  | 'sending'
  | 'done'
  | 'error';

export default function HeavyShareScreen({ route, navigation }: Props) {
  const sessionId = route.params.session;
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [liftSummary, setLiftSummary] = useState({ workouts: 0, sets: 0 });
  const [liftsData, setLiftsData] = useState<{ [id: string]: Lift }>({});

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<any>(null);
  const answerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const icePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanedUpRef = useRef(false);
  const statusRef = useRef<Status>('loading');
  const dataSentRef = useRef(false);

  const updateStatus = useCallback((s: Status) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  // Load lift data and verify session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Verify session exists and is waiting
        const sessionRes = await fetch(
          `${FIREBASE_BASE}/heavy-sessions/${sessionId}.json`,
        );
        if (!sessionRes.ok) {
          throw new Error('session_fetch_failed');
        }
        const session = await sessionRes.json();
        if (!session || session.status !== 'waiting') {
          throw new Error('session_expired');
        }

        // Load local lift data
        const lifts = await retrieveLifts();
        if (cancelled) return;

        const liftValues = Object.values(lifts);
        const totalSets = liftValues.reduce(
          (sum, l) =>
            sum + l.movements.reduce((ms, m) => ms + m.sets.length, 0),
          0,
        );

        setLiftsData(lifts);
        setLiftSummary({ workouts: liftValues.length, sets: totalSets });
        updateStatus('approval');
      } catch (e: any) {
        if (cancelled) return;
        if (e.message === 'session_expired') {
          setErrorMsg('This session has expired. Please scan again.');
        } else {
          setErrorMsg('Could not reach server. Please try again.');
        }
        updateStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;

    if (answerPollRef.current) clearInterval(answerPollRef.current);
    if (icePollRef.current) clearInterval(icePollRef.current);

    try {
      dcRef.current?.close();
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}

    dcRef.current = null;
    pcRef.current = null;
  }, []);

  const deleteSession = async () => {
    try {
      await fetch(`${FIREBASE_BASE}/heavy-sessions/${sessionId}.json`, {
        method: 'DELETE',
      });
    } catch {}
  };

  const handleShare = async () => {
    updateStatus('connecting');
    cleanedUpRef.current = false;

    try {
      // 1. Create peer connection
      const pc = new RTCPeerConnection(STUN_CONFIG);
      pcRef.current = pc;

      // 2. Create data channel before offer
      const dc = pc.createDataChannel('liftdata');
      dcRef.current = dc;

      (dc as any).addEventListener('open', () => {
        updateStatus('sending');
        sendData();
      });

      (dc as any).addEventListener('error', () => {
        if (!dataSentRef.current) {
          fail('Connection failed. Please try again.');
        }
      });

      // 3. Gather ICE candidates and push to Firebase
      (pc as any).addEventListener('icecandidate', async (event: any) => {
        if (event.candidate) {
          try {
            await fetch(
              `${FIREBASE_BASE}/heavy-sessions/${sessionId}/iceCandidates/app.json`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  candidate: event.candidate.candidate,
                  sdpMid: event.candidate.sdpMid,
                  sdpMLineIndex: event.candidate.sdpMLineIndex,
                }),
              },
            );
          } catch {}
        }
      });

      (pc as any).addEventListener('iceconnectionstatechange', () => {
        const state = pc.iceConnectionState;
        if (state === 'failed' || state === 'disconnected') {
          if (dataSentRef.current) {
            updateStatus('done');
            deleteSession();
            setTimeout(() => cleanup(), 1000);
          } else {
            fail('Connection failed. Please try again.');
          }
        }
      });

      // 4. Create offer
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);

      // 5. Write offer to Firebase
      await fetch(
        `${FIREBASE_BASE}/heavy-sessions/${sessionId}/offer.json`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: offer.type,
            sdp: offer.sdp,
          }),
        },
      );

      // 6. Poll for SDP answer
      let answerSet = false;
      answerPollRef.current = setInterval(async () => {
        if (answerSet) return;
        try {
          const res = await fetch(
            `${FIREBASE_BASE}/heavy-sessions/${sessionId}/answer.json`,
          );
          const answer = await res.json();
          if (answer && answer.sdp) {
            answerSet = true;
            if (answerPollRef.current) clearInterval(answerPollRef.current);
            await pc.setRemoteDescription(
              new RTCSessionDescription(answer),
            );
          }
        } catch {}
      }, 500);

      // 7. Poll for browser ICE candidates
      let knownCandidates = new Set<string>();
      icePollRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `${FIREBASE_BASE}/heavy-sessions/${sessionId}/iceCandidates/web.json`,
          );
          const candidates = await res.json();
          if (candidates && typeof candidates === 'object') {
            Object.values(candidates).forEach((c: any) => {
              const key = c.candidate;
              if (key && !knownCandidates.has(key)) {
                knownCandidates.add(key);
                pc.addIceCandidate(new RTCIceCandidate(c));
              }
            });
          }
        } catch {}
      }, 500);

      // Timeout after 30s
      setTimeout(() => {
        if (statusRef.current === 'connecting') {
          fail('Connection timed out. Please try again.');
        }
      }, 30_000);
    } catch (e: any) {
      fail('Connection failed. Please try again.');
    }
  };

  const sendData = () => {
    const dc = dcRef.current;
    if (!dc) return;

    const payload = JSON.stringify({
      exportDate: new Date().toISOString(),
      workouts: Object.values(liftsData),
    });

    if (payload.length <= CHUNK_SIZE) {
      dc.send(payload);
    } else {
      for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
        dc.send(payload.substring(i, i + CHUNK_SIZE));
      }
    }
    dc.send('__END__');
    dataSentRef.current = true;

    updateStatus('done');

    // Cleanup
    deleteSession();
    setTimeout(() => {
      cleanup();
    }, 1000);
  };

  const fail = (msg: string) => {
    setErrorMsg(msg);
    updateStatus('error');
    cleanup();
  };

  const handleClose = () => {
    cleanup();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'LiftList' }],
      }),
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.statusText}>Loading...</Text>
          </>
        )}

        {status === 'approval' && (
          <>
            <Text style={styles.title}>Share Lift Data</Text>
            <Text style={styles.description}>
              Send your data to a connected browser session.
            </Text>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>
                {liftSummary.workouts} workout{liftSummary.workouts !== 1 ? 's' : ''},{' '}
                {liftSummary.sets} set{liftSummary.sets !== 1 ? 's' : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
              <Text style={styles.shareButtonText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'connecting' && (
          <>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.statusText}>Connecting...</Text>
          </>
        )}

        {status === 'sending' && (
          <>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.statusText}>Sending data...</Text>
          </>
        )}

        {status === 'done' && (
          <>
            <Text style={styles.title}>Transfer Complete</Text>
            <Text style={styles.description}>
              Your lift data has been sent to the browser.
            </Text>
            <TouchableOpacity style={styles.shareButton} onPress={handleClose}>
              <Text style={styles.shareButtonText}>Done</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'error' && (
          <>
            <Text style={styles.title}>Something Went Wrong</Text>
            <Text style={styles.description}>{errorMsg}</Text>
            <TouchableOpacity style={styles.shareButton} onPress={handleClose}>
              <Text style={styles.shareButtonText}>OK</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    color: '#aaa',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  summaryBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  summaryText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  shareButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    marginBottom: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    minWidth: 200,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 17,
  },
  statusText: {
    color: '#aaa',
    fontSize: 16,
    marginTop: 16,
  },
});
