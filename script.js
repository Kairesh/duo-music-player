// --- Setup Socket.IO ---
const socket = io();
const roomID = "duo-room-1"; // Default room for simplicity
const username = "User_" + Math.floor(Math.random() * 1000);

// --- State ---
let player;
let isPlaying = false;
let currentSource = 'youtube';
let isLooping = false;
let playlist = [];

// --- Stars Animation ---
function createStars() {
    const bg = document.getElementById('star-bg');
    for (let i = 0; i < 50; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.width = Math.random() * 4 + 'px';
        star.style.height = star.style.width;
        star.style.animationDuration = (Math.random() * 3 + 2) + 's';
        bg.appendChild(star);
    }
}
createStars();

// --- Waves Gen ---
function createWaves() {
    const container = document.getElementById('waves-container');
    for (let i = 0; i < 20; i++) {
        const bar = document.createElement('div');
        bar.className = 'wave-bar';
        bar.style.animationDelay = (i * 0.1) + 's';
        container.appendChild(bar);
    }
}
createWaves();

// --- Socket Events ---
socket.on('connect', () => {
    document.getElementById('connection-status').innerText = "Connected";
    document.getElementById('connection-status').style.color = "#00ff00";
    socket.emit('join', { username: username, room: roomID });
});

socket.on('disconnect', () => {
    document.getElementById('connection-status').innerText = "Disconnected";
    document.getElementById('connection-status').style.color = "#ff0000";
});

socket.on('status', (data) => {
    console.log(data.msg);
});

socket.on('queue_update', (queueData) => {
    // Update visual playlist
    const list = document.getElementById('playlist-container');
    list.innerHTML = ''; // Clear current
    queueData.forEach(vidId => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.innerHTML = `<i class="fas fa-clock"></i> <div class="track-info">ID: ${vidId}</div>`;
        list.appendChild(item);
    });
});

socket.on('sync_action', (data) => {
    console.log("Received action:", data);

    if (data.type === 'play') {
        if (player && player.playVideo) player.playVideo();
        updatePlayState(true);
    }
    else if (data.type === 'pause') {
        if (player && player.pauseVideo) player.pauseVideo();
        updatePlayState(false);
    }
    else if (data.type === 'change_link') {
        if (player && player.loadVideoById) {
            player.loadVideoById(data.value);
            updatePlayState(true);
            // We don't add to playlist div here anymore, queue_update handles future, 
            // maybe show "Now Playing" separately.
            document.getElementById('now-playing-text').innerText = "Playing: " + data.value;
        }
    }
    else if (data.type === 'seek') {
        if (player && player.seekTo) player.seekTo(data.value);
    }
    else if (data.type === 'loop_toggle') {
        updateLoopState(data.value);
    }
});

socket.on('sync_state', (data) => {
    // Initial loop state
    if (data.is_looping !== undefined) {
        updateLoopState(data.is_looping);
    }

    // Initial load state for late joiners
    if (data.current_link) {
        setTimeout(() => {
            if (player && player.loadVideoById) {
                // Load and seek to server calculated time
                player.loadVideoById({
                    'videoId': data.current_link,
                    'startSeconds': data.timestamp // Precise sync start
                });

                if (data.is_playing) {
                    player.playVideo();
                    updatePlayState(true);
                } else {
                    player.pauseVideo();
                    updatePlayState(false);
                }

                // Double check UI
                document.getElementById('now-playing-text').innerText = "Syncing...";
            }
        }, 1000);
    }
    // Sync Queue
    if (data.queue) {
        const list = document.getElementById('playlist-container');
        list.innerHTML = '';
        data.queue.forEach(vidId => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.innerHTML = `<i class="fas fa-clock"></i> <div class="track-info">ID: ${vidId}</div>`;
            list.appendChild(item);
        });
    }
});

// --- Player Logic ---
function onYouTubeIframeAPIReady() {
    player = new YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: '',
        playerVars: {
            'playsinline': 1,
            'controls': 0,
            'disablekb': 1,
            'origin': window.location.origin
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log("Player Ready");
}

function onPlayerStateChange(event) {
    // If song ends
    if (event.data === YT.PlayerState.ENDED) {
        updatePlayState(false);
        // Request next song
        socket.emit('sync_action', { room: roomID, type: 'song_ended' });
    }
}

// --- Control Functions ---
function togglePlay() {
    if (isPlaying) {
        socket.emit('sync_action', { room: roomID, type: 'pause' });
    } else {
        socket.emit('sync_action', { room: roomID, type: 'play' });
    }
}

function updatePlayState(playing) {
    isPlaying = playing;
    const icon = document.getElementById('play-icon');
    const cd = document.getElementById('cd-disc');

    if (!icon || !cd) return;

    if (playing) {
        icon.classList.remove('fa-play');
        icon.classList.add('fa-pause');
        cd.classList.add('playing');
    } else {
        icon.classList.remove('fa-pause');
        icon.classList.add('fa-play');
        cd.classList.remove('playing');
    }
}

function loadLink() {
    const input = document.getElementById('link-input');
    const url = input.value;
    if (url) {
        let videoId = null;
        if (currentSource === 'youtube') {
            videoId = extractVideoId(url);
        }

        if (videoId) {
            // Check if user wants to Queue or Play Immediately?
            // For now: Play Immediately if nothing playing? Or always Play?
            // Let's Add to Queue by default if playing?
            // The user asked "add more links so those links played after the one song ended"
            // So we need an "Add to Queue" button or logic.
            // Let's trigger "Play Now" for this specific button for simplicity (as "Paste Bar" usually implies "Play This"),
            // But we can add a specific "Queue" button.

            // Wait, let's keep "+" as "Play Now" and add a Queue button?
            // User: "link paste bar... link option... add more links to make a playlist"
            // I'll make the main button Play Now, and add a Queue button.
            socket.emit('sync_action', { room: roomID, type: 'change_link', value: videoId, source: currentSource });
            input.value = '';
        } else {
            console.error("Invalid YouTube URL");
            // Show error in UI
            document.getElementById('link-input').placeholder = "Invalid URL! Try again.";
        }
    }
}

function addToQueue() {
    const input = document.getElementById('link-input');
    const url = input.value;
    if (url) {
        let videoId = extractVideoId(url);
        if (videoId) {
            socket.emit('sync_action', { room: roomID, type: 'queue_add', value: videoId });
            input.value = '';
            // Visual feedback
            input.placeholder = "Added to Queue!";
            setTimeout(() => input.placeholder = "Paste YouTube Link...", 2000);
        }
    }
}

function extractVideoId(url) {
    // Robust Regex for mobile/short/standard links
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : false;
}

function setSource(source) {
    currentSource = source;
    document.querySelectorAll('.switch-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-source="${source}"]`).classList.add('active');

    const input = document.getElementById('link-input');
    input.placeholder = source === 'youtube' ? 'Paste YouTube Link...' : 'Spotify not supported yet';
}

function seek(seconds) {
    if (!player) return;
    const currentTime = player.getCurrentTime();
    player.seekTo(currentTime + seconds);
    socket.emit('sync_action', { room: roomID, type: 'seek', value: currentTime + seconds });
}

function toggleLoop() {
    isLooping = !isLooping;
}
