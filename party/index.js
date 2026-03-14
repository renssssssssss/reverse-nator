/**
 * 逆ネーター — PartyKit サーバー
 * 1ルーム = 1ゲームセッション
 * メッセージタイプ一覧:
 *   C→S  join         { role: "questioner"|"guesser" }
 *   C→S  set_people   { people: string[] }          // 出題者のみ
 *   C→S  question     { text: string }              // 回答者のみ
 *   C→S  answer       { value: "○"|"×"|"△" }       // 出題者のみ
 *   C→S  guess        { text: string }              // 回答者のみ
 *   C→S  judge        { correct: boolean }          // 出題者のみ
 *   C→S  reset        {}
 *
 *   S→C  state        { ...gameState }              // 全員に送信
 *   S→C  error        { message: string }
 */

export default class ReverseNatorParty {
  constructor(room) {
    this.room = room;
    this.state = this.initialState();
  }

  initialState() {
    return {
      phase: "waiting",       // waiting | setup | q_wait | q_answer | judge | result
      roles: {},              // connectionId -> role
      people: [],             // 出題者が入力した人物（回答者には送らない）
      qaLog: [],              // { q, a }[]
      pendingQuestion: null,
      pendingGuess: null,
      totalQuestions: 0,
      totalGuesses: 0,
      correct: false,
      playerCount: 0,
    };
  }

  onConnect(conn) {
    this.state.playerCount = [...this.room.getConnections()].length;
    // 現在の状態を接続者に送信（peopleは隠す）
    conn.send(JSON.stringify({ type: "state", ...this.sanitize(conn.id) }));
    this.broadcast({ type: "state", ...this.sanitize(null) });
  }

  onClose(conn) {
    delete this.state.roles[conn.id];
    this.state.playerCount = [...this.room.getConnections()].length;
    this.broadcast({ type: "state", ...this.sanitize(null) });
  }

  onMessage(message, sender) {
    let msg;
    try { msg = JSON.parse(message); } catch { return; }

    const role = this.state.roles[sender.id];

    switch (msg.type) {

      case "join": {
        const wantedRole = msg.role;
        // 既に同じロールがいる場合は拒否
        const taken = Object.values(this.state.roles).includes(wantedRole);
        if (taken) {
          sender.send(JSON.stringify({ type: "error", message: "そのロールは既に選ばれています" }));
          return;
        }
        this.state.roles[sender.id] = wantedRole;
        const roles = Object.values(this.state.roles);
        if (roles.includes("questioner") && roles.includes("guesser")) {
          this.state.phase = "setup";
        }
        this.broadcastAll();
        break;
      }

      case "set_people": {
        if (role !== "questioner") return;
        this.state.people = msg.people.filter(Boolean).slice(0, 5);
        this.state.phase = "q_wait";
        this.broadcastAll();
        break;
      }

      case "question": {
        if (role !== "guesser") return;
        if (this.state.phase !== "q_wait") return;
        this.state.pendingQuestion = msg.text;
        this.state.phase = "q_answer";
        this.broadcastAll();
        break;
      }

      case "answer": {
        if (role !== "questioner") return;
        if (this.state.phase !== "q_answer") return;
        this.state.qaLog.push({ q: this.state.pendingQuestion, a: msg.value });
        this.state.totalQuestions++;
        this.state.pendingQuestion = null;
        this.state.phase = "q_wait";
        this.broadcastAll();
        break;
      }

      case "guess": {
        if (role !== "guesser") return;
        if (this.state.phase !== "q_wait") return;
        this.state.pendingGuess = msg.text;
        this.state.totalGuesses++;
        this.state.phase = "judge";
        this.broadcastAll();
        break;
      }

      case "judge": {
        if (role !== "questioner") return;
        if (this.state.phase !== "judge") return;
        this.state.correct = msg.correct;
        if (msg.correct) {
          this.state.phase = "result";
        } else {
          this.state.pendingGuess = null;
          this.state.phase = "q_wait";
        }
        this.broadcastAll();
        break;
      }

      case "reset": {
        const savedRoles = { ...this.state.roles };
        this.state = this.initialState();
        this.state.roles = savedRoles;
        this.state.playerCount = [...this.room.getConnections()].length;
        const roles = Object.values(this.state.roles);
        if (roles.includes("questioner") && roles.includes("guesser")) {
          this.state.phase = "setup";
        }
        this.broadcastAll();
        break;
      }
    }
  }

  // peopleを送信相手によって隠す
  sanitize(connId) {
    const myRole = connId ? this.state.roles[connId] : null;
    return {
      phase: this.state.phase,
      roles: this.state.roles,
      // 出題者自身にのみpeopleを送る。回答者・観客には空配列
      people: myRole === "questioner" ? this.state.people : [],
      qaLog: this.state.qaLog,
      pendingQuestion: this.state.pendingQuestion,
      pendingGuess: this.state.pendingGuess,
      totalQuestions: this.state.totalQuestions,
      totalGuesses: this.state.totalGuesses,
      correct: this.state.correct,
      playerCount: this.state.playerCount,
      myRole,
    };
  }

  broadcastAll() {
    for (const conn of this.room.getConnections()) {
      conn.send(JSON.stringify({ type: "state", ...this.sanitize(conn.id) }));
    }
  }

  broadcast(msg) {
    const str = JSON.stringify(msg);
    for (const conn of this.room.getConnections()) {
      conn.send(str);
    }
  }
}
