
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/utils/trpc';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, SkipForward, Phone, PhoneOff, Volume2, Users, AlertCircle, RefreshCw } from 'lucide-react';
import type { UserSession, Room } from '../../server/src/schema';

interface RoomStatus {
  room: Room | null;
  partner: UserSession | null;
}

function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>({ room: null, partner: null });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'waiting' | 'connected'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [serverAvailable, setServerAvailable] = useState(false);

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Test server connection
  const testServerConnection = useCallback(async (): Promise<boolean> => {
    try {
      const response = await trpc.healthcheck.query();
      if (response.status === 'ok') {
        setServerAvailable(true);
        return true;
      }
    } catch (error) {
      console.error('Server connection test failed:', error);
      setServerAvailable(false);
    }
    return false;
  }, []);

  // Initialize session on app load
  const initializeSession = useCallback(async () => {
    setIsInitializing(true);
    setError(null);
    
    try {
      // Test server connection first
      const serverReady = await testServerConnection();
      if (!serverReady) {
        throw new Error('Server is not available. Please ensure the server is running on the correct port.');
      }

      // Create session
      const newSession = await trpc.createSession.mutate({});
      setSession(newSession);
      setError(null);
    } catch (error: unknown) {
      console.error('Failed to create session:', error);
      
      // Provide more specific error messages
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      if (errorMessage.includes('fetch')) {
        setError('Unable to connect to server. Please check if the server is running and accessible.');
      } else if (errorMessage.includes('JSON')) {
        setError('Server returned invalid response. Please check server configuration.');
      } else if (errorMessage.includes('pattern')) {
        setError('Server response format error. Please check server implementation.');
      } else {
        setError(errorMessage || 'Failed to initialize session. Please try again.');
      }
    } finally {
      setIsInitializing(false);
    }
  }, [testServerConnection]);

  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // Poll room status when session exists
  const pollRoomStatus = useCallback(async () => {
    if (!session || !serverAvailable) return;
    
    try {
      const status = await trpc.getRoomStatus.query(session.id);
      setRoomStatus(status);
      
      // Update connection status based on room and partner
      if (status.room && status.partner) {
        setConnectionStatus('connected');
      } else if (status.room) {
        setConnectionStatus('waiting');
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (error) {
      console.error('Failed to get room status:', error);
      // Don't show error for polling failures to avoid spam
    }
  }, [session, serverAvailable]);

  useEffect(() => {
    if (!session || !serverAvailable) return;

    // Poll room status every 3 seconds (reduced frequency to avoid server overload)
    const interval = setInterval(pollRoomStatus, 3000);
    
    // Initial poll
    pollRoomStatus();

    return () => clearInterval(interval);
  }, [session, serverAvailable, pollRoomStatus]);

  // Initialize audio context and media recorder
  const initializeAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext();
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        
        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          
          if (session && serverAvailable) {
            try {
              await trpc.sendVoiceMessage.mutate({
                session_id: session.id,
                audio_data: base64Audio,
                duration_ms: 1000 // Approximate duration
              });
            } catch (error) {
              console.error('Failed to send voice message:', error);
            }
          }
        };
        reader.readAsDataURL(audioBlob);
      };
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      setError('Unable to access microphone. Please allow microphone access and refresh the page.');
    }
  }, [session, serverAvailable]);

  const handleJoinRoom = async () => {
    if (!session || !serverAvailable) return;
    
    setIsConnecting(true);
    setError(null);
    
    try {
      await trpc.joinRoom.mutate({ session_id: session.id });
      await initializeAudio();
      pollRoomStatus(); // Immediate update
    } catch (error: unknown) {
      console.error('Failed to join room:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Failed to join voice room: ${errorMessage}. Please try again.`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!session || !serverAvailable) return;
    
    try {
      await trpc.leaveRoom.mutate({ session_id: session.id });
      setConnectionStatus('disconnected');
      
      // Stop any ongoing recording
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
      
      // Update speaking status
      if (isSpeaking) {
        await trpc.updateSpeakingStatus.mutate({
          session_id: session.id,
          is_speaking: false
        });
        setIsSpeaking(false);
      }
    } catch (error: unknown) {
      console.error('Failed to leave room:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Failed to leave room: ${errorMessage}. Please try again.`);
    }
  };

  const handleSkipConnection = async () => {
    if (!session || !serverAvailable) return;
    
    setIsConnecting(true);
    setError(null);
    
    try {
      await trpc.skipConnection.mutate({ session_id: session.id });
      pollRoomStatus(); // Immediate update
    } catch (error: unknown) {
      console.error('Failed to skip connection:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Failed to skip connection: ${errorMessage}. Please try again.`);
    } finally {
      setIsConnecting(false);
    }
  };

  const startSpeaking = async () => {
    if (!session || !mediaRecorderRef.current || connectionStatus !== 'connected' || !serverAvailable) return;
    
    try {
      await trpc.updateSpeakingStatus.mutate({
        session_id: session.id,
        is_speaking: true
      });
      
      setIsSpeaking(true);
      setIsRecording(true);
      mediaRecorderRef.current.start();
    } catch (error: unknown) {
      console.error('Failed to start speaking:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Failed to start speaking: ${errorMessage}. Please try again.`);
    }
  };

  const stopSpeaking = async () => {
    if (!session || !mediaRecorderRef.current || !serverAvailable) return;
    
    try {
      await trpc.updateSpeakingStatus.mutate({
        session_id: session.id,
        is_speaking: false
      });
      
      setIsSpeaking(false);
      setIsRecording(false);
      
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    } catch (error: unknown) {
      console.error('Failed to stop speaking:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Failed to stop speaking: ${errorMessage}. Please try again.`);
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'waiting': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'waiting': return 'Waiting for partner...';
      default: return 'Disconnected';
    }
  };

  // Show error state if initialization failed
  if (error && !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
              <h2 className="text-xl font-semibold text-gray-800">Connection Failed</h2>
              <Alert className="text-left">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button onClick={initializeSession} className="w-full" disabled={isInitializing}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isInitializing ? 'animate-spin' : ''}`} />
                {isInitializing ? 'Connecting...' : 'Retry Connection'}
              </Button>
              <div className="text-sm text-gray-500 space-y-1">
                <p>Troubleshooting steps:</p>
                <ul className="text-left space-y-1">
                  <li>• Check if the server is running</li>
                  <li>• Verify server is on the correct port</li>
                  <li>• Check browser console for details</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading state during initialization
  if (isInitializing || !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Initializing your anonymous session...</p>
            <p className="text-sm text-gray-500 mt-2">
              {serverAvailable ? 'Connecting to voice server...' : 'Testing server connection...'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🎙️ Voice Chat</h1>
          <p className="text-gray-600">Connect with strangers through voice</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${serverAvailable ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-gray-500">
              Server {serverAvailable ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && session && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Status Card */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-lg">
              <span>Connection Status</span>
              <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status:</span>
                <Badge variant={connectionStatus === 'connected' ? 'default' : 'secondary'}>
                  {getStatusText()}
                </Badge>
              </div>
              
              {roomStatus.room && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Room:</span>
                  <span className="text-sm font-mono text-gray-800">
                    {roomStatus.room.id.slice(0, 8)}...
                  </span>
                </div>
              )}
              
              {roomStatus.room && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Users:</span>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="text-sm">{roomStatus.room.user_count}/2</span>
                  </div>
                </div>
              )}

              {roomStatus.partner && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Partner:</span>
                  <div className="flex items-center gap-2">
                    {roomStatus.partner.is_speaking && (
                      <Volume2 className="w-4 h-4 text-green-500 animate-pulse" />
                    )}
                    <Badge variant="outline">
                      {roomStatus.partner.is_speaking ? 'Speaking' : 'Listening'}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <Card>
          <CardContent className="p-6">
            {connectionStatus === 'disconnected' ? (
              <div className="space-y-4">
                <Button
                  onClick={handleJoinRoom}
                  disabled={isConnecting || !serverAvailable}
                  className="w-full h-12 text-lg font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                >
                  {isConnecting ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Connecting...
                    </div>
                  ) : !serverAvailable ? (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      Server Unavailable
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Phone className="w-5 h-5" />
                      Start Voice Chat
                    </div>
                  )}
                </Button>
                <p className="text-sm text-gray-500 text-center">
                  {serverAvailable 
                    ? 'Connect with a random stranger for voice conversation'
                    : 'Please wait for server connection to be restored'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Push to Talk Button */}
                <div className="text-center space-y-2">
                  <Button
                    onMouseDown={startSpeaking}
                    onMouseUp={stopSpeaking}
                    onTouchStart={startSpeaking}
                    onTouchEnd={stopSpeaking}
                    disabled={connectionStatus !== 'connected' || !serverAvailable}
                    className={`w-24 h-24 rounded-full text-lg font-bold transition-all disabled:opacity-50 ${
                      isSpeaking 
                        ? 'bg-red-500 hover:bg-red-600 scale-110 shadow-lg' 
                        : 'bg-green-500 hover:bg-green-600'
                    }`}
                  >
                    {isSpeaking ? (
                      <MicOff className="w-8 h-8" />
                    ) : (
                      <Mic className="w-8 h-8" />
                    )}
                  </Button>
                  <p className="text-sm text-gray-600">
                    {!serverAvailable ? 'Server offline' :
                     connectionStatus === 'connected' 
                      ? (isSpeaking ? 'Release to stop' : 'Hold to speak')
                      : 'Waiting for partner...'
                    }
                  </p>
                </div>

                <Separator />

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={handleSkipConnection}
                    disabled={isConnecting || !serverAvailable}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <SkipForward className="w-4 h-4" />
                    Skip
                  </Button>
                  <Button
                    onClick={handleLeaveRoom}
                    disabled={!serverAvailable}
                    variant="outline"
                    className="flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <PhoneOff className="w-4 h-4" />
                    Leave
                  </Button>
                </div>

                <p className="text-xs text-gray-500 text-center">
                  This is a walkie-talkie style chat. Hold the mic button to speak.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>No registration required • Anonymous & secure</p>
          <p className="mt-1">Session ID: {session.id.slice(0, 8)}...</p>
        </div>
      </div>
    </div>
  );
}

export default App;
