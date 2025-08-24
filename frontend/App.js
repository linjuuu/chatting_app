import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, Alert, SafeAreaView, StatusBar } from 'react-native';
import { io } from 'socket.io-client';

export default function App() {
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [partner, setPartner] = useState('');

  useEffect(() => {
    // Socket.io 연결
    const newSocket = io('http://192.168.219.184:3001');
    setSocket(newSocket);

    // 연결 이벤트
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
      setIsMatching(false);
      setCurrentRoom(null);
    });

    // 매칭 이벤트
    newSocket.on('match-found', (data) => {
      console.log('Match found:', data);
      setIsMatching(false);
      setCurrentRoom(data.roomId);
      setPartner(data.partner);
      Alert.alert('매칭 성공!', `${data.partner}님과 연결되었습니다.`);
    });

    newSocket.on('matching-cancelled', () => {
      setIsMatching(false);
      Alert.alert('매칭 취소', '매칭이 취소되었습니다.');
    });

    // 메시지 이벤트
    newSocket.on('new-message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    // 채팅 종료 이벤트
    newSocket.on('chat-ended', () => {
      Alert.alert('채팅 종료', '상대방이 채팅을 종료했습니다.');
      setCurrentRoom(null);
      setMessages([]);
      setPartner('');
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const startMatching = () => {
    if (!username.trim()) {
      Alert.alert('오류', '사용자명을 입력해주세요.');
      return;
    }
    
    if (socket) {
      socket.emit('join-matching', { username: username.trim() });
      setIsMatching(true);
    }
  };

  const cancelMatching = () => {
    if (socket) {
      socket.emit('cancel-matching');
      setIsMatching(false);
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim() || !currentRoom || !socket) return;
    
    const messageData = {
      roomId: currentRoom,
      message: newMessage.trim(),
      username: username
    };
    
    socket.emit('send-message', messageData);
    
    // 로컬에 메시지 추가
    const localMessage = {
      id: Date.now().toString(),
      sender: username,
      content: newMessage.trim(),
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, localMessage]);
    setNewMessage('');
  };

  const endChat = () => {
    if (socket && currentRoom) {
      socket.emit('end-chat', { roomId: currentRoom });
      setCurrentRoom(null);
      setMessages([]);
      setPartner('');
    }
  };

  const renderMessage = ({ item }) => (
    <View style={[
      styles.messageContainer,
      item.sender === username ? styles.myMessage : styles.otherMessage
    ]}>
      <Text style={styles.messageText}>{item.content}</Text>
      <Text style={styles.timestamp}>
        {new Date(item.timestamp).toLocaleTimeString()}
      </Text>
    </View>
  );

  if (!isConnected) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.title}>채팅 앱</Text>
          <Text style={styles.subtitle}>서버에 연결 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!username) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.title}>채팅 앱</Text>
          <TextInput
            style={styles.input}
            placeholder="사용자명을 입력하세요"
            value={username}
            onChangeText={setUsername}
            maxLength={20}
          />
          <TouchableOpacity 
            style={styles.button}
            onPress={() => setUsername(username.trim())}
          >
            <Text style={styles.buttonText}>시작하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isMatching) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.title}>매칭 중...</Text>
          <Text style={styles.subtitle}>상대방을 찾고 있습니다</Text>
          <TouchableOpacity 
            style={[styles.button, styles.cancelButton]}
            onPress={cancelMatching}
          >
            <Text style={styles.buttonText}>매칭 취소</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (currentRoom) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{partner}님과의 채팅</Text>
          <TouchableOpacity onPress={endChat}>
            <Text style={styles.endButton}>종료</Text>
          </TouchableOpacity>
        </View>
        
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          style={styles.messagesList}
        />
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.messageInput}
            placeholder="메시지를 입력하세요"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
          />
          <TouchableOpacity 
            style={styles.sendButton}
            onPress={sendMessage}
          >
            <Text style={styles.sendButtonText}>전송</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centerContainer}>
        <Text style={styles.title}>안녕하세요, {username}님!</Text>
        <Text style={styles.subtitle}>랜덤 채팅을 시작해보세요</Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={startMatching}
        >
          <Text style={styles.buttonText}>매칭 시작</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: 'white',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  endButton: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  messagesList: {
    flex: 1,
    padding: 10,
  },
  messageContainer: {
    marginVertical: 5,
    padding: 10,
    borderRadius: 15,
    maxWidth: '80%',
  },
  myMessage: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
  },
  otherMessage: {
    backgroundColor: '#E5E5EA',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 16,
    color: 'white',
  },
  timestamp: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});
