import eventlet
eventlet.monkey_patch()
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import logging

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Store current room state (rudimentary)
# In production, use Redis or a DB
rooms = {}

@app.route('/')
def index():
    return render_template('index.html')

import time

@socketio.on('join')
def on_join(data):
    username = data['username']
    room = data['room']
    join_room(room)
    
    # Initialize room if not exists
    if room not in rooms:
        rooms[room] = {
            'current_source': 'youtube', 
            'current_link': '',
            'is_playing': False,
            'timestamp': 0,
            'last_update': 0,
            'is_looping': False,
            'queue': []
        }
    
    # Calculate current real-time timestamp
    room_data = rooms[room]
    current_time = room_data['timestamp']
    if room_data['is_playing']:
        elapsed = time.time() - room_data['last_update']
        current_time += elapsed
    
    sync_packet = room_data.copy()
    sync_packet['timestamp'] = current_time
    
    emit('sync_state', sync_packet, room=request.sid)
    emit('status', {'msg': username + ' has entered the room.'}, room=room)

@socketio.on('sync_action')
def on_sync_action(data):
    room = data['room']
    action_type = data['type']
    
    if room in rooms:
        if action_type == 'play':
            rooms[room]['is_playing'] = True
            rooms[room]['timestamp'] = data.get('value', rooms[room]['timestamp'])
            rooms[room]['last_update'] = time.time()
            emit('sync_action', data, room=room)
            
        elif action_type == 'pause':
            rooms[room]['is_playing'] = False
            rooms[room]['timestamp'] = data.get('value', rooms[room]['timestamp'])
            rooms[room]['last_update'] = time.time() 
            emit('sync_action', data, room=room)
            
        elif action_type == 'seek':
            rooms[room]['timestamp'] = data.get('value', 0)
            rooms[room]['last_update'] = time.time()
            emit('sync_action', data, room=room)
            
        elif action_type == 'loop_toggle':
            rooms[room]['is_looping'] = data.get('value', False)
            emit('sync_action', data, room=room)

        elif action_type == 'change_link':
            rooms[room]['current_link'] = data.get('value')
            rooms[room]['current_source'] = data.get('source', 'youtube')
            rooms[room]['timestamp'] = 0
            rooms[room]['is_playing'] = True 
            rooms[room]['last_update'] = time.time()
            emit('sync_action', data, room=room)
            
        elif action_type == 'queue_add':
            video_id = data.get('value')
            if video_id:
                rooms[room]['queue'].append(video_id)
                emit('queue_update', rooms[room]['queue'], room=room)

        elif action_type == 'song_ended' or action_type == 'skip':
            if rooms[room]['is_looping'] and action_type == 'song_ended':
                # Replay Same Song
                rooms[room]['timestamp'] = 0
                rooms[room]['is_playing'] = True
                rooms[room]['last_update'] = time.time()
                emit('sync_action', {
                    'type': 'seek',
                    'value': 0,
                    'is_replay': True, 
                    'room': room
                }, room=room)
            
            elif len(rooms[room]['queue']) > 0:
                # Play Next
                next_song = rooms[room]['queue'].pop(0)
                rooms[room]['current_link'] = next_song
                rooms[room]['timestamp'] = 0
                rooms[room]['is_playing'] = True
                rooms[room]['last_update'] = time.time()
                
                emit('sync_action', {
                    'type': 'change_link',
                    'value': next_song,
                    'source': 'youtube', 
                    'room': room
                }, room=room)
                emit('queue_update', rooms[room]['queue'], room=room)

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, debug=False, host='0.0.0.0', port=port)
