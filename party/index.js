/**
 * 逆ネーター — PartyKit サーバー
 * 公式 Party.Server クラスAPI準拠
 */

function initialState() {
  return {
    phase: "waiting",       // waiting | setup | q_wait | q_answer | judge | result
    roles: {},              // connectionId -> "questioner"|"guesser"
    people: [],             // 出題者のみ閲覧可
    qaLog: [],              // { q, a }[]
    pendingQuestion: null,
    pendingGuess: null,
    totalQuestions: 0,
    totalGuesses: 0,
    correct: false,
  };
}

export default class Server {
  constructor(room) {
    this.room = room;
    this.state = initialState();
  }

  // 接続者ごとにpeopleの可視性を制御
  sanitize(connId) {
    const myRole = connId ? this.state.roles[connId] : null;
    return {
      phase: this.state.phase,
      roles: this.state.roles,
      people: myRole === "questioner" ? this.state.people : [],
      qaLog: this.state.qaLog,
      pendingQuestion: this.state.pendingQuestion,
      pendingGuess: this.state.pendingGuess,
      totalQuestions: this.state.totalQuestions,
      totalGuesses: this.state.totalGuesses,
      correct: this.state.correct,
      myRole,
    };
  }

  broadcastAll() {
    for (const conn of this.room.getConnections()) {
      conn.send(JSON.stringify({ type: "state", ...this.sanitize(conn.id) }));
    }
  }

  onConnect(conn) {
    conn.send(JSON.stringify({ type: "state", ...this.sanitize(conn.id) }));
  }

  onClose(conn) {
    delete this.state.roles[conn.id];
    const remaining = [...this.room.getConnections()].length;
    if (remaining === 0) {
      this.state = initialState();
    } else {
      this.broadcastAll();
    }
  }

  onMessage(message, sender) {
    let msg;
    try { msg = JSON.parse(message); } catch { return; }

    const role = this.state.roles[sender.id];

    switch (msg.type) {
      case "join": {
        const taken = Object.values(this.state.roles).includes(msg.role);
        if (taken) {
          sender.send(JSON.stringify({ type: "error", message: "そのロールは既に選ばれています" }));
          return;
        }
        this.state.roles[sender.id] = msg.role;
        const vals = Object.values(this.state.roles);
        if (vals.includes("questioner") && vals.includes("guesser")) {
          this.state.phase = "setup";
        }
        this.broadcastAll();
        break;
      }
      case "set_people": {
        if (role !== "questioner") return;
        this.state.people = (msg.people || []).filter(Boolean).slice(0, 5);
        this.state.phase = "q_wait";
        this.broadcastAll();
        break;
      }
      case "question": {
        if (role !== "guesser" || this.state.phase !== "q_wait") return;
        this.state.pendingQuestion = msg.text;
        this.state.phase = "q_answer";
        this.broadcastAll();
        break;
      }
      case "answer": {
        if (role !== "questioner" || this.state.phase !== "q_answer") return;
        this.state.qaLog.push({ q: this.state.pendingQuestion, a: msg.value });
        this.state.totalQuestions++;
        this.state.pendingQuestion = null;
        this.state.phase = "q_wait";
        this.broadcastAll();
        break;
      }
      case "guess": {
        if (role !== "guesser" || this.state.phase !== "q_wait") return;
        this.state.pendingGuess = msg.text;
        this.state.totalGuesses++;
        this.state.phase = "judge";
        this.broadcastAll();
        break;
      }
      case "judge": {
        if (role !== "questioner" || this.state.phase !== "judge") return;
        this.state.correct = msg.correct;
        this.state.phase = msg.correct ? "result" : "q_wait";
        if (!msg.correct) this.state.pendingGuess = null;
        this.broadcastAll();
        break;
      }
      case "reset": {
        const savedRoles = { ...this.state.roles };
        this.state = initialState();
        this.state.roles = savedRoles;
        const vals = Object.values(savedRoles);
        if (vals.includes("questioner") && vals.includes("guesser")) {
          this.state.phase = "setup";
        }
        this.broadcastAll();
        break;
      }
    }
  }
}
