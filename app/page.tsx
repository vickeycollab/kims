"use client";
import { useEffect, useMemo, useState } from "react";

async function api(body?: Record<string, unknown>) {
  const response = await fetch("/api/answers", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "처리하지 못했습니다.");
  return data;
}
const compact = (value: string) => value.replace(/[\s,]/g, "");

export default function Home() {
  const [tab, setTab] = useState<"student" | "admin">("student");
  const [configured, setConfigured] = useState(false);
  const [questions, setQuestions] = useState<number[]>([]);
  const [answerText, setAnswerText] = useState("");
  const [keyText, setKeyText] = useState("");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [wrong, setWrong] = useState<number[] | null>(null);
  const [stats, setStats] = useState<{question:number; count:number}[]>([]);
  const [message, setMessage] = useState("");
  const count = useMemo(() => compact(answerText).length, [answerText]);

  const load = async () => {
    try { const data = await api(); setConfigured(data.configured); setQuestions(data.questions); }
    catch (error) { setMessage(error instanceof Error ? error.message : "불러오지 못했습니다."); }
  };
  useEffect(() => { void load(); }, []);

  const check = async () => {
    setWrong(null); setMessage("");
    if (!count) return setMessage("답안을 입력해 주세요.");
    try { const data = await api({ action:"check", answers:answerText }); setWrong(data.wrong); }
    catch (error) { setMessage(error instanceof Error ? error.message : "확인하지 못했습니다."); }
  };
  const setup = async () => {
    try { await api({ action:"setup", pin:newPin }); setConfigured(true); setPin(newPin); setMessage("관리자 코드가 설정되었습니다."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "설정하지 못했습니다."); }
  };
  const saveKeys = async () => {
    try { const data = await api({ action:"saveKeys", pin, answers:keyText }); setQuestions(Array.from({length:data.questions}, (_, i) => i + 1)); setMessage("답안표를 저장했습니다. 학생에게는 정답이 보이지 않습니다."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); }
  };
  const loadStats = async () => {
    try { const data = await api({ action:"stats", pin }); setStats(data.stats); }
    catch (error) { setMessage(error instanceof Error ? error.message : "통계를 불러오지 못했습니다."); }
  };
  const top = Math.max(1, ...stats.map((item) => item.count));

  return <main>
    <header><div><div className="eyebrow">ANSWER CHECK</div><h1>오답 확인</h1><p>정답은 보이지 않아요. 틀린 문항 번호만 확인하세요.</p></div><div className="notice">정답 비공개 모드</div></header>
    <div className="tabs"><button className={tab==="student" ? "tab active" : "tab"} onClick={() => setTab("student")}>학생</button><button className={tab==="admin" ? "tab active" : "tab"} onClick={() => setTab("admin")}>관리자</button></div>
    {tab==="student" ? <section className="card"><div className="row"><div><h2>내 답안 입력</h2><p>답을 붙여 입력하세요. 첫 글자는 1번, 둘째 글자는 2번입니다.</p></div><span className="badge">{count} / {questions.length} 입력</span></div>
      {questions.length ? <><textarea value={answerText} onChange={(event) => setAnswerText(event.target.value)} placeholder="예: 1324453144554244" aria-label="내 답안" /><p className="small">공백·쉼표·줄바꿈은 무시합니다. 한 문항당 한 글자씩 입력하세요.</p><button className="primary" onClick={check}>오답 확인</button><button className="secondary" onClick={() => { setAnswerText(""); setWrong(null); }}>다시 입력</button></> : <p>관리자가 답안표를 등록하면 이곳에 문항 수가 표시됩니다.</p>}
      {wrong && <div className={wrong.length ? "result bad" : "result good"}>{wrong.length ? <>틀린 문항: {wrong.map((q) => q + "번").join(", ")}<div className="small">정답은 공개되지 않습니다.</div></> : "입력한 문항은 모두 맞았습니다."}</div>}
    </section> : <section className="card"><h2>관리자 화면</h2><p>답안표를 관리하고 문항별 오답 빈도를 확인합니다.</p>
      {!configured ? <><h3>관리자 코드 설정</h3><input type="password" value={newPin} onChange={(event) => setNewPin(event.target.value)} placeholder="관리자 코드 (4자 이상)" /><button className="primary" onClick={setup}>설정</button></> : <><input type="password" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="관리자 코드" /><div className="admin-grid"><div><h3>답안표 등록·수정</h3><p className="small">정답을 붙여 넣으세요. 예: 1324453144554244</p><textarea value={keyText} onChange={(event) => setKeyText(event.target.value)} placeholder="1324453144554244" /><button className="primary" onClick={saveKeys}>답안표 저장</button></div><div><div className="row"><div><h3>많이 틀린 문항</h3><p className="small">학생들의 답안 확인 누적 횟수입니다.</p></div><button className="secondary" onClick={loadStats}>새로고침</button></div>{stats.map((item, index) => <div className="stat" key={item.question}><b>{index+1}</b><span>{item.question}번</span><div className="bar"><i style={{width:(item.count/top*100)+"%"}} /></div><b>{item.count}회</b></div>)}{!stats.length && <p className="small">관리자 코드를 입력하고 새로고침하면 통계를 볼 수 있습니다.</p>}</div></div></>}
    </section>}
    {message && <p className="error">{message}</p>}
  </main>;
}
