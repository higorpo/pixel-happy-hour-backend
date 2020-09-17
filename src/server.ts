import http from 'http';
import socket from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import challenges from './challenges';
import { ServerConnectedPlayer, ServerRoom } from './interfaces';
import { randomColor, shuffle } from './utils';

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<h1>Hello World!<h1>');
    res.end();
});

const io = socket(server, {
    pingTimeout: 1000,
});


// Jogadores conectados na partida
let connectedPlayers: ServerConnectedPlayer[] = [];

// Salas disponíveis
let rooms: ServerRoom[] = []


io.on('connection', function (socket: socket.Socket) {
    console.log('new connection', socket.id);

    // Adiciona o usuário aos usuários conectados no servidor
    connectedPlayers.push({
        id: socket.id,
        roomId: null
    })

    // Envia todas as salas disponíveis pro usuário
    socket.emit('server_rooms', rooms);

    socket.on('disconnect', () => {
        console.log("usuário saiu")

        // Remove o usuário do servidor e da partida (se ele estiver em uma)
        const player = connectedPlayers.find(player => player.id == socket.id);

        if (player?.roomId != undefined) {
            console.log("Desconectando o usuário da sala")


            const roomIndex = rooms.findIndex(room => room.id == player?.roomId);

            socket.leave(player?.roomId);
            socket.broadcast.to(player?.roomId).emit("player_disconnect", rooms[roomIndex].players.find(player => player.id == socket.id));

            rooms[roomIndex].players = rooms[roomIndex].players.filter(player => player.id != socket.id);

            socket.broadcast.emit('update_room', rooms[roomIndex]);

            // Verifica se era o jogador da rodada, se for, passa pro próximo
            if (rooms[roomIndex].round_player?.id == player.id) {
                io.sockets.in(player?.roomId).emit("round_player", nextPlayerRound(player?.roomId));
            }

            // Verifica se o usuário que saiu da sala era o último, se for, deleta a sala
            if (rooms[roomIndex].players.length == 0) {
                socket.broadcast.emit('on_room_deleted', rooms[roomIndex].id);
                rooms.splice(roomIndex, 1);
            }

            // Se sobrou só um usuário na sala, reseta
            if (rooms[roomIndex]?.players?.length == 1) {
                rooms[roomIndex].game_started = false;
                rooms[roomIndex].round_player = null;

                io.sockets.in(rooms[roomIndex].id).emit("round_player", null);
                io.sockets.in(rooms[roomIndex].id).emit("game_started", false);
                io.sockets.in(rooms[roomIndex].id).emit("selected_challenge", null);
            }
        }

        connectedPlayers = connectedPlayers.filter(player => player.id != socket.id);
    })

    // Criar uma sala
    socket.on('create_room', (roomName) => {
        let room = createRoom(roomName); // Cria a sala com o nome desejado
        socket.emit('created_room', room); // Envia pro usuário a sala criada

        socket.broadcast.emit('on_room_created', room);
    })

    // Conectar em uma sala
    socket.on('connect_to_room', ({ roomId, playername }) => {
        // Verifica se a sala existe
        const room = rooms.find(room => room.id == roomId);

        if (room == undefined) {
            socket.emit('non_existent_room');
        } else {
            const player = {
                id: socket.id,
                name: playername,
                played_times: 0,
                sign_in_date: new Date(),
                color: randomColor()
            };

            room?.players.push(player);

            const playerIndex = connectedPlayers.findIndex(player => player.id == socket.id);
            connectedPlayers[playerIndex].roomId = roomId;

            socket.broadcast.emit('update_room', room);

            socket.join(roomId); // Entra na sala

            // Envia pra todos os outros jogadores da sala que este usuário se conectou
            socket.broadcast.to(roomId).emit('player_connect', player);


            // Envia as informações da sala pro usuário
            socket.emit('room_info', {
                room,
                playerId: socket.id
            })
        }

        console.log("Conectado a sala", room);
    })

    // Iniciar um jogo
    socket.on('start_game', (roomId: string) => {
        const roomIndex = rooms.findIndex(room => room.id == roomId);

        if (roomIndex == -1) {
            socket.emit('start_game_error');
        } else {
            rooms[roomIndex].game_started = true;

            // Envia para todos da sala que o jogo foi iniciado
            io.sockets.in(roomId).emit("game_started", true);

            // Define quem é o próximo jogador da rodada e envia para todos os jogadores conectados
            io.sockets.in(roomId).emit("round_player", nextPlayerRound(roomId));
        }
    })

    // Resetar um jogo
    socket.on('reset_game', (roomId: string) => {
        const roomIndex = rooms.findIndex(room => room.id == roomId);

        if (roomIndex == -1) {
            socket.emit('reset_game_error');
        } else {
            rooms[roomIndex].game_started = false;
            rooms[roomIndex].round_player = null;

            io.sockets.in(roomId).emit("round_player", null);
            io.sockets.in(roomId).emit("game_started", false);
            io.sockets.in(roomId).emit("selected_challenge", null);
        }
    })

    // Quando um jogador seleciona um desafio
    socket.on('selected_challenge', ({ roomId, title, description }) => {
        io.sockets.in(roomId).emit("selected_challenge", {
            title,
            description
        })
    })

    // Quando um jogador cumpre a challenge
    socket.on('challenge_conclude', (roomId) => {
        io.sockets.in(roomId).emit("selected_challenge", null);

        // Define quem é o próximo jogador da rodada e envia para todos os jogadores conectados
        io.sockets.in(roomId).emit("round_player", nextPlayerRound(roomId));
    })

    socket.on('disconnect_room', () => {
        // Remove o usuário da partida (se ele estiver em uma)
        const player = connectedPlayers.find(player => player.id == socket.id);
        const playerIndex = connectedPlayers.findIndex(player => player.id == socket.id);

        if (player?.roomId != undefined) {
            console.log("Desconectando o usuário da sala")

            const roomIndex = rooms.findIndex(room => room.id == player?.roomId);

            socket.leave(player?.roomId);
            socket.broadcast.to(player?.roomId).emit("player_disconnect", rooms[roomIndex].players.find(player => player.id == socket.id));

            rooms[roomIndex].players = rooms[roomIndex].players.filter(player => player.id != socket.id);

            socket.broadcast.emit('update_room', rooms[roomIndex]);

            // Verifica se era o jogador da rodada, se for, passa pro próximo
            if (rooms[roomIndex].round_player?.id == player.id) {
                io.sockets.in(player?.roomId).emit("round_player", nextPlayerRound(player?.roomId));
            }

            // Verifica se o usuário que saiu da sala era o último, se for, deleta a sala
            if (rooms[roomIndex].players?.length == 0) {
                socket.broadcast.emit('on_room_deleted', rooms[roomIndex].id);
                rooms.splice(roomIndex, 1);
            }

            // Se sobrou só um usuário na sala, reseta
            if (rooms[roomIndex]?.players?.length == 1) {
                rooms[roomIndex].game_started = false;
                rooms[roomIndex].round_player = null;

                io.sockets.in(rooms[roomIndex].id).emit("round_player", null);
                io.sockets.in(rooms[roomIndex].id).emit("game_started", false);
                io.sockets.in(rooms[roomIndex].id).emit("selected_challenge", null);
            }
        }

        connectedPlayers[playerIndex].roomId = null;
    })
});

// Define qual é o próximo jogador da rodada
function nextPlayerRound(roomId: string) {
    const roomIndex = rooms.findIndex(room => room.id == roomId);

    const next_player = rooms[roomIndex].players.reduce(function (prev, curr) {
        return prev.played_times < curr.played_times ? prev : curr;
    });

    const playerIndex = rooms[roomIndex].players.findIndex(player => player.id == next_player.id);
    rooms[roomIndex].players[playerIndex].played_times += 1;

    rooms[roomIndex].round_player = next_player;

    return next_player;
}

// Cria uma nova sala
function createRoom(roomName: string) {
    const newRoom: ServerRoom = {
        id: uuidv4(),
        name: roomName,
        game_started: false,
        players: [],
        round_player: null,
        challenges: shuffle(challenges as any)
    };

    rooms.push(newRoom);

    return newRoom;
}

server.listen(process.env.PORT || 3333, function () {
    console.log('Server is running');
});