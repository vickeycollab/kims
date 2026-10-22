"use client";

import Image from "next/image";
import { useState } from "react";

type Classroom = { id: string; name: string; code: string };
type HomeworkSession = { id: string; name: string; questionCount?: number };
type TeacherSession = HomeworkSession & { classId: string; answers: string[]; createdAt: string; statsResetAt?: string };
type Teacher = { id: string; name: string; classes: Classroom[]; sessions: TeacherSession[]; updatedAt: string };
type StudentSpace = { classroom: Classroom; sessions: HomeworkSession[] };
type StudentRecord = { answers: string[]; wrong: number[]; checkedAt: string };
type View = "home" | "studentCode" | "studentDashboard" | "studentSession" | "teacherCode" | "teacherEnroll" | "teacherDashboard";

async function api(body: Record<string, unknown>) {
  const response = await fetch("/api/answers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "처리하지 못했습니다.");
  return data;
}

const compact = (value: string) => value.replace(/[\s,]/g, "");
const studentIdKey = "dashclass:student-id";
const recordKey = (classCode: string, sessionId: string) => `dashclass:record:${classCode}:${sessionId}`;

function getStudentId() {
  const existing = window.localStorage.getItem(studentIdKey);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(studentIdKey, id);
  return id;
}

function getStudentRecord(classCode: string, sessionId: string): StudentRecord | null {
  try {
    const stored = window.localStorage.getItem(recordKey(classCode, sessionId));
    return stored ? JSON.parse(stored) as StudentRecord : null;
  } catch {
    return null;
  }
}

function saveStudentRecord(classCode: string, sessionId: string, record: StudentRecord) {
  window.localStorage.setItem(recordKey(classCode, sessionId), JSON.stringify(record));
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [message, setMessage] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [studentSpace, setStudentSpace] = useState<StudentSpace | null>(null);
  const [studentSession, setStudentSession] = useState<HomeworkSession | null>(null);
  const [studentAnswers, setStudentAnswers] = useState<string[]>([]);
  const [wrong, setWrong] = useState<number[] | null>(null);

  const [teacherCode, setTeacherCode] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [newTeacherCode, setNewTeacherCode] = useState("");
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [className, setClassName] = useState("");
  const [classCode, setClassCode] = useState("");
  const [sessionClassId, setSessionClassId] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [editingSessionName, setEditingSessionName] = useState("");
  const [keyText, setKeyText] = useState("");
  const [stats, setStats] = useState<{ question: number; count: number }[]>([]);
  const [statsStudents, setStatsStudents] = useState(0);

  const resetMessage = () => setMessage("");

  const goHome = () => {
    resetMessage();
    setView("home");
  };

  const goStudentDashboard = () => {
    resetMessage();
    setStudentSession(null);
    setView("studentDashboard");
  };

  const enterStudent = async () => {
    resetMessage();
    try {
      const data = await api({ action: "resolveClass", classCode: studentCode });
      setStudentSpace(data);
      setStudentSession(null);
      setView("studentDashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "반 정보를 불러오지 못했습니다.");
    }
  };

  const openStudentSession = (session: HomeworkSession) => {
    const saved = getStudentRecord(studentCode, session.id);
    const answerCount = session.questionCount ?? 0;
    setStudentSession(session);
    setStudentAnswers(saved?.answers.length === answerCount ? saved.answers : Array.from({ length: answerCount }, () => ""));
    setWrong(saved?.wrong ?? null);
    resetMessage();
    setView("studentSession");
  };

  const checkAnswers = async () => {
    resetMessage();
    if (!studentSession || !studentAnswers.length || studentAnswers.some((answer) => !answer)) {
      return setMessage("모든 문항의 답을 선택해 주세요.");
    }
    try {
      const data = await api({
        action: "submitAnswers",
        classCode: studentCode,
        sessionId: studentSession.id,
        studentId: getStudentId(),
        answers: studentAnswers.join(""),
      });
      const result = data.wrong as number[];
      setWrong(result);
      saveStudentRecord(studentCode, studentSession.id, {
        answers: studentAnswers,
        wrong: result,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "오답을 확인하지 못했습니다.");
    }
  };

  const enterTeacher = async () => {
    resetMessage();
    try {
      const data = await api({ action: "teacherLogin", code: teacherCode });
      if (data.bootstrap) {
        setView("teacherEnroll");
        return;
      }
      setTeacher(data.teacher);
      setView("teacherDashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인하지 못했습니다.");
    }
  };

  const createTeacher = async () => {
    resetMessage();
    try {
      const data = await api({
        action: "createTeacher",
        bootstrapCode: teacherCode,
        name: teacherName,
        pin: newTeacherCode,
      });
      setTeacherCode(newTeacherCode);
      setTeacher(data.teacher);
      setView("teacherDashboard");
      setMessage("개인 관리자 코드가 설정되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "관리자 계정을 만들지 못했습니다.");
    }
  };

  const updateTeacher = (nextTeacher: Teacher) => setTeacher(nextTeacher);

  const addClass = async () => {
    resetMessage();
    try {
      const data = await api({ action: "addClass", pin: teacherCode, name: className, code: classCode });
      updateTeacher(data.teacher);
      setClassName("");
      setClassCode("");
      setMessage("반을 추가했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "반을 추가하지 못했습니다.");
    }
  };

  const addSession = async () => {
    resetMessage();
    try {
      const data = await api({ action: "addSession", pin: teacherCode, classId: sessionClassId, name: sessionName });
      updateTeacher(data.teacher);
      setSessionName("");
      setSessionClassId("");
      setMessage("숙제 세션을 만들었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "숙제를 만들지 못했습니다.");
    }
  };

  const selectedSession = teacher?.sessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectedClass = teacher?.classes.find((item) => item.id === selectedSession?.classId) ?? null;

  const openTeacherSession = (session: TeacherSession) => {
    resetMessage();
    setSelectedSessionId(session.id);
    setEditingSessionName(session.name);
    setKeyText(session.answers.join(""));
    setStats([]);
    setStatsStudents(0);
  };

  const saveAnswers = async () => {
    if (!selectedSession) return;
    resetMessage();
    try {
      const data = await api({ action: "saveAnswers", pin: teacherCode, sessionId: selectedSession.id, answers: keyText });
      updateTeacher(data.teacher);
      setKeyText(compact(keyText));
      setMessage(`${data.questionCount}문항의 답안표를 저장했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "답안표를 저장하지 못했습니다.");
    }
  };

  const renameSession = async () => {
    if (!selectedSession) return;
    resetMessage();
    try {
      const data = await api({ action: "renameSession", pin: teacherCode, sessionId: selectedSession.id, name: editingSessionName });
      updateTeacher(data.teacher);
      setMessage("숙제 이름을 수정했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "숙제 이름을 수정하지 못했습니다.");
    }
  };

  const deleteSession = async () => {
    if (!selectedSession || !window.confirm(`‘${selectedSession.name}’ 숙제를 삭제할까요? 삭제 후 되돌릴 수 없습니다.`)) return;
    resetMessage();
    try {
      const data = await api({ action: "deleteSession", pin: teacherCode, sessionId: selectedSession.id });
      updateTeacher(data.teacher);
      setSelectedSessionId("");
      setKeyText("");
      setStats([]);
      setMessage("숙제를 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "숙제를 삭제하지 못했습니다.");
    }
  };

  const resetStats = async () => {
    if (!selectedSession || !window.confirm("이 숙제의 오답 빈도를 0회부터 다시 집계할까요? 기존 기록은 통계에서 제외됩니다.")) return;
    resetMessage();
    try {
      const data = await api({ action: "resetStats", pin: teacherCode, sessionId: selectedSession.id });
      updateTeacher(data.teacher);
      setStats([]);
      setStatsStudents(0);
      setMessage("오답 빈도 집계를 다시 시작했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "오답 빈도를 초기화하지 못했습니다.");
    }
  };

  const loadStats = async () => {
    if (!selectedSession) return;
    resetMessage();
    try {
      const data = await api({ action: "getStats", pin: teacherCode, sessionId: selectedSession.id });
      setStats(data.stats);
      setStatsStudents(data.students);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "통계를 불러오지 못했습니다.");
    }
  };

  const top = Math.max(1, ...stats.map((item) => item.count));

  return (
    <main>
      <header className="brand-header">
        <button className="brand" onClick={goHome} aria-label="대시나루 첫 화면">
          <Image className="brand-logo" src="/dashnaru-logo.svg" alt="대시나루 국어학원" width={158} height={46} priority />
        </button>
        <div className="header-actions">
          {view === "studentSession" && <button className="text-button" onClick={goStudentDashboard}>숙제 목록</button>}
          {view !== "home" && <button className="text-button" onClick={goHome}>처음으로</button>}
        </div>
      </header>

      {view === "home" && (
        <section className="welcome">
          <p className="eyebrow">DASHNARU KOREAN ACADEMY</p>
          <h1>숙제 오답 확인</h1>
          <p className="intro">정답은 공개하지 않고, 틀린 문항 번호만 알려드립니다.</p>
          <div className="role-grid">
            <button className="role-card student-card" onClick={() => { resetMessage(); setView("studentCode"); }}>
              <span className="role-number">01</span><h2>학생</h2><p>반 코드를 입력하고<br />이번 숙제를 선택하세요.</p><b>들어가기 <span>→</span></b>
            </button>
            <button className="role-card teacher-card" onClick={() => { resetMessage(); setView("teacherCode"); }}>
              <span className="role-number">02</span><h2>선생님</h2><p>반과 숙제를 만들고<br />오답 빈도를 확인하세요.</p><b>관리자 로그인 <span>→</span></b>
            </button>
          </div>
        </section>
      )}

      {view === "studentCode" && (
        <section className="panel narrow">
          <p className="eyebrow">STUDENT ACCESS</p><h1>반 코드 입력</h1><p>선생님께 받은 반 코드를 입력해 주세요.</p>
          <input value={studentCode} onChange={(event) => setStudentCode(event.target.value)} placeholder="예: 432" inputMode="numeric" onKeyDown={(event) => event.key === "Enter" && void enterStudent()} />
          <button className="primary" onClick={enterStudent}>숙제 목록 보기</button>
        </section>
      )}

      {view === "studentDashboard" && studentSpace && (
        <section className="panel dashboard-panel">
          <div className="page-heading"><div><p className="eyebrow">{studentSpace.classroom.name}</p><h1>숙제 대시보드</h1><p>확인할 숙제를 선택해 주세요. 채점한 숙제는 결과가 저장됩니다.</p></div><span className="count-chip">{studentSpace.sessions.length}개의 숙제</span></div>
          <div className="session-grid">
            {studentSpace.sessions.map((session, index) => {
              const saved = getStudentRecord(studentCode, session.id);
              return <button className="session-card" key={session.id} onClick={() => openStudentSession(session)}>
                <span>{String(index + 1).padStart(2, "0")}</span><h2>{session.name}</h2><p>{session.questionCount ? `${session.questionCount}문항` : "답안 등록 대기 중"}</p>
                <b>{saved ? "저장된 결과 보기" : "오답 확인"} <i>→</i></b>
              </button>;
            })}
            {!studentSpace.sessions.length && <p className="empty">등록된 숙제가 아직 없습니다.</p>}
          </div>
        </section>
      )}

      {view === "studentSession" && studentSpace && studentSession && (
        <section className="answer-panel">
          <div className="answer-heading">
            <div><p className="eyebrow">{studentSpace.classroom.name}</p><h1>{studentSession.name}</h1><p>각 문항의 답을 눌러 선택해 주세요.</p></div>
            <div className="answer-progress"><b>{studentAnswers.filter(Boolean).length}</b> / {studentAnswers.length}<span>문항 선택</span></div>
          </div>
          <div className="answer-grid">
            {studentAnswers.map((selected, index) => {
              const question = index + 1;
              const isWrong = wrong?.includes(question);
              return <div className={isWrong ? "answer-card wrong-answer" : "answer-card"} key={question}>
                <span className="question-number">{question}</span>
                <div className="choice-row" role="group" aria-label={`${question}번 답 선택`}>
                  {["0", "1", "2", "3", "4", "5"].map((choice) => (
                    <button type="button" className={selected === choice ? "choice selected" : "choice"} key={choice} aria-pressed={selected === choice} onClick={() => {
                      setStudentAnswers((answers) => answers.map((answer, answerIndex) => answerIndex === index ? choice : answer));
                      setWrong(null);
                    }}>{choice}</button>
                  ))}
                </div>
              </div>;
            })}
          </div>
          {!studentAnswers.length && <p className="empty">선생님이 아직 이 숙제의 답안표를 등록하지 않았습니다.</p>}
          {!!studentAnswers.length && <button className="primary complete-button" onClick={checkAnswers}>답 기입 완료</button>}
          {wrong && <div className={wrong.length ? "result bad" : "result good"}>
            {wrong.length ? <><strong>틀린 문항: {wrong.map((question) => `${question}번`).join(", ")}</strong><p>노란 테두리 문항을 다시 확인해 보세요. 정답은 공개되지 않습니다.</p></> : <strong>선택한 문항은 모두 맞았습니다.</strong>}
          </div>}
        </section>
      )}

      {view === "teacherCode" && (
        <section className="panel narrow">
          <p className="eyebrow">TEACHER ACCESS</p><h1>선생님 코드 입력</h1><p>처음 이용하는 선생님은 예비 코드를 입력해 개인 코드를 만드세요.</p>
          <input type="password" value={teacherCode} onChange={(event) => setTeacherCode(event.target.value)} placeholder="선생님 코드" inputMode="numeric" onKeyDown={(event) => event.key === "Enter" && void enterTeacher()} />
          <button className="primary" onClick={enterTeacher}>관리자 페이지로</button>
        </section>
      )}

      {view === "teacherEnroll" && (
        <section className="panel narrow">
          <p className="eyebrow">FIRST SETUP</p><h1>개인 관리자 만들기</h1><p>이후에는 아래에서 설정한 개인 코드로만 내 관리 페이지에 들어올 수 있습니다.</p>
          <label>선생님 이름<input value={teacherName} onChange={(event) => setTeacherName(event.target.value)} placeholder="예: 김선생님" /></label>
          <label>개인 관리자 코드<input type="password" value={newTeacherCode} onChange={(event) => setNewTeacherCode(event.target.value)} placeholder="4자 이상 숫자 또는 문자" /></label>
          <button className="primary" onClick={createTeacher}>개인 관리자 만들기</button>
        </section>
      )}

      {view === "teacherDashboard" && teacher && (
        <section className="teacher-layout">
          <aside>
            <p className="eyebrow">{teacher.name} 선생님</p><h1>관리자 대시보드</h1><p>내 반과 숙제를 운영하세요.</p>
            <div className="create-box"><h3>새 반 만들기</h3><input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="반 이름 (예: 용호중)" /><input value={classCode} onChange={(event) => setClassCode(event.target.value)} placeholder="반 코드 (예: 432)" inputMode="numeric" /><button className="secondary" onClick={addClass}>반 추가</button></div>
            <div className="create-box"><h3>새 숙제 만들기</h3><select value={sessionClassId} onChange={(event) => setSessionClassId(event.target.value)}><option value="">반 선택</option>{teacher.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input value={sessionName} onChange={(event) => setSessionName(event.target.value)} placeholder="숙제 이름 (예: 1주차 숙제)" /><button className="secondary" onClick={addSession}>숙제 추가</button></div>
          </aside>

          <div className="dashboard-content">
            <div className="page-heading"><div><p className="eyebrow">MY CLASSES</p><h2>반별 숙제 세션</h2></div><span className="count-chip">{teacher.classes.length}개 반</span></div>
            {teacher.classes.map((classroom) => {
              const sessions = teacher.sessions.filter((session) => session.classId === classroom.id);
              return <section className="class-section" key={classroom.id}>
                <div className="class-title"><div><h3>{classroom.name}</h3><p>학생 반 코드 <b>{classroom.code}</b></p></div><span>{sessions.length}개 숙제</span></div>
                <div className="session-grid compact-grid">
                  {sessions.map((session) => <button className={selectedSessionId === session.id ? "session-card selected" : "session-card"} key={session.id} onClick={() => openTeacherSession(session)}><span>숙제</span><h2>{session.name}</h2><p>{session.answers.length ? `${session.answers.length}문항 등록됨` : "답안표 미등록"}</p><b>관리하기 <i>→</i></b></button>)}
                  {!sessions.length && <p className="empty">이 반의 숙제를 추가해 주세요.</p>}
                </div>
              </section>;
            })}
            {!teacher.classes.length && <p className="empty large-empty">왼쪽에서 첫 번째 반을 추가해 주세요.</p>}

            {selectedSession && <section className="manage-session">
              <div className="manage-top"><div><p className="eyebrow">{selectedClass?.name}</p><h2>{selectedSession.name}</h2></div><span className="count-chip">{selectedSession.answers.length}문항</span></div>
              <div className="session-name-editor"><input aria-label="숙제 이름" value={editingSessionName} onChange={(event) => setEditingSessionName(event.target.value)} /><button className="outline-button" onClick={renameSession}>이름 저장</button></div>
              <div className="manage-grid">
                <div><h3>정답표 등록·수정</h3><p className="small">번호 없이 정답을 이어서 입력하세요. 예: 1324453144554244</p><textarea value={keyText} onChange={(event) => setKeyText(event.target.value)} placeholder="1324453144554244" aria-label="정답표" /><button className="primary" onClick={saveAnswers}>답안표 저장</button></div>
                <div><div className="row"><div><h3>많이 틀린 문항</h3><p className="small">현재 {statsStudents}명의 최신 채점 기록을 집계합니다.</p></div><button className="outline-button" onClick={loadStats}>새로고침</button></div>
                  {stats.map((item, index) => <div className="stat" key={item.question}><b>{index + 1}</b><span>{item.question}번</span><div className="bar"><i style={{ width: `${(item.count / top) * 100}%` }} /></div><b>{item.count}회</b></div>)}
                  {!stats.length && <p className="empty">새로고침하면 이 숙제의 오답 빈도를 볼 수 있습니다.</p>}
                </div>
              </div>
              <div className="danger-zone"><div><h3>숙제 관리</h3><p>통계는 새 반을 시작할 때만 초기화하세요. 숙제를 삭제하면 되돌릴 수 없습니다.</p></div><div><button className="outline-button" onClick={resetStats}>오답 빈도 초기화</button><button className="danger-button" onClick={deleteSession}>숙제 삭제</button></div></div>
            </section>}
          </div>
        </section>
      )}

      {message && <p className="message">{message}</p>}
    </main>
  );
}
