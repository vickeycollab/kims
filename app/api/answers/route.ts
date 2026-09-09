import { get, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";

type Classroom = { id: string; name: string; code: string };
type HomeworkSession = { id: string; classId: string; name: string; answers: string[]; createdAt: string };
type Teacher = {
  id: string;
  name: string;
  pinHash: string;
  classes: Classroom[];
  sessions: HomeworkSession[];
  updatedAt: string;
};
type PublicTeacher = Omit<Teacher, "pinHash">;

const MASTER_CODE = "0909";
const TEACHER_PREFIX = "private/teachers/";
const SUBMISSION_PREFIX = "private/submissions/";

function compact(value: unknown) {
  return String(value ?? "")
    .replace(/[\s,]/g, "")
    .split("")
    .filter(Boolean)
    .map((item) => item.toUpperCase());
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readBlobJson(blob: { url: string }) {
  const value: any = await get(blob.url, { access: "private" });
  if (!value) return null;
  return JSON.parse(await new Response(value.stream).text());
}

async function teachers() {
  const { blobs } = await list({ prefix: TEACHER_PREFIX, limit: 1000 });
  const newest = new Map<string, Teacher>();
  const ordered = [...blobs].sort((a, b) => b.pathname.localeCompare(a.pathname));

  for (const blob of ordered) {
    const teacher = (await readBlobJson(blob)) as Teacher | null;
    if (teacher?.id && !newest.has(teacher.id)) newest.set(teacher.id, teacher);
  }
  return [...newest.values()];
}

async function saveTeacher(teacher: Teacher) {
  const saved = { ...teacher, updatedAt: new Date().toISOString() };
  await put(
    `${TEACHER_PREFIX}${saved.id}/${Date.now()}-${crypto.randomUUID()}.json`,
    JSON.stringify(saved),
    { access: "private", contentType: "application/json" },
  );
  return saved;
}

function publicTeacher(teacher: Teacher): PublicTeacher {
  const { pinHash: _pinHash, ...safeTeacher } = teacher;
  return safeTeacher;
}

async function authenticatedTeacher(pin: unknown) {
  const pinHash = await hash(clean(pin));
  return (await teachers()).find((teacher) => teacher.pinHash === pinHash) ?? null;
}

function responseError(error: unknown) {
  const message = error instanceof Error ? error.message : "저장소를 사용할 수 없습니다.";
  if (message.includes("BLOB_READ_WRITE_TOKEN")) {
    return NextResponse.json(
      { error: "저장소가 아직 연결되지 않았습니다. 관리자에게 Vercel Blob 연결을 요청해 주세요." },
      { status: 503 },
    );
  }
  console.error(error);
  return NextResponse.json({ error: "처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = clean(body.action);

    if (action === "teacherLogin") {
      const code = clean(body.code);
      if (code === MASTER_CODE) return NextResponse.json({ bootstrap: true });
      const teacher = await authenticatedTeacher(code);
      if (!teacher) return NextResponse.json({ error: "선생님 코드를 다시 확인해 주세요." }, { status: 401 });
      return NextResponse.json({ teacher: publicTeacher(teacher) });
    }

    if (action === "createTeacher") {
      if (clean(body.bootstrapCode) !== MASTER_CODE) {
        return NextResponse.json({ error: "예비 관리자 코드가 맞지 않습니다." }, { status: 401 });
      }
      const name = clean(body.name);
      const pin = clean(body.pin);
      if (!name) return NextResponse.json({ error: "선생님 이름을 입력해 주세요." }, { status: 400 });
      if (pin.length < 4 || pin === MASTER_CODE) {
        return NextResponse.json({ error: "개인 관리자 코드는 4자 이상이며 0909와 달라야 합니다." }, { status: 400 });
      }
      const pinHash = await hash(pin);
      if ((await teachers()).some((teacher) => teacher.pinHash === pinHash)) {
        return NextResponse.json({ error: "이미 사용 중인 관리자 코드입니다." }, { status: 409 });
      }
      const teacher = await saveTeacher({
        id: crypto.randomUUID(),
        name,
        pinHash,
        classes: [],
        sessions: [],
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ teacher: publicTeacher(teacher) });
    }

    if (action === "resolveClass") {
      const code = clean(body.classCode);
      const match = (await teachers())
        .flatMap((teacher) => teacher.classes.map((classroom) => ({ teacher, classroom })))
        .find(({ classroom }) => classroom.code === code);
      if (!match) return NextResponse.json({ error: "반 코드를 다시 확인해 주세요." }, { status: 404 });
      const sessions = match.teacher.sessions
        .filter((session) => session.classId === match.classroom.id)
        .map(({ id, name, answers }) => ({ id, name, questionCount: answers.length }));
      return NextResponse.json({ classroom: match.classroom, sessions });
    }

    if (action === "submitAnswers") {
      const classCode = clean(body.classCode);
      const sessionId = clean(body.sessionId);
      const match = (await teachers())
        .flatMap((teacher) => teacher.classes.map((classroom) => ({ teacher, classroom })))
        .find(({ classroom }) => classroom.code === classCode);
      if (!match) return NextResponse.json({ error: "반 정보를 찾을 수 없습니다." }, { status: 404 });
      const session = match.teacher.sessions.find(
        (item) => item.id === sessionId && item.classId === match.classroom.id,
      );
      if (!session?.answers.length) {
        return NextResponse.json({ error: "선생님이 아직 이 숙제의 답안을 등록하지 않았습니다." }, { status: 400 });
      }
      const submitted = compact(body.answers);
      if (!submitted.length) return NextResponse.json({ error: "답안을 입력해 주세요." }, { status: 400 });
      const wrong = submitted.flatMap((answer, index) =>
        session.answers[index] && session.answers[index] !== answer ? [index + 1] : [],
      );
      await put(
        `${SUBMISSION_PREFIX}${Date.now()}-${crypto.randomUUID()}.json`,
        JSON.stringify({
          teacherId: match.teacher.id,
          classId: match.classroom.id,
          sessionId,
          wrong,
          submittedAt: new Date().toISOString(),
        }),
        { access: "private", contentType: "application/json" },
      );
      return NextResponse.json({ wrong });
    }

    const teacher = await authenticatedTeacher(body.pin);
    if (!teacher) return NextResponse.json({ error: "선생님 코드를 다시 확인해 주세요." }, { status: 401 });

    if (action === "addClass") {
      const name = clean(body.name);
      const code = clean(body.code);
      if (!name || code.length < 3) {
        return NextResponse.json({ error: "반 이름과 3자 이상의 반 코드를 입력해 주세요." }, { status: 400 });
      }
      const duplicate = (await teachers()).some((item) => item.classes.some((classroom) => classroom.code === code));
      if (duplicate) return NextResponse.json({ error: "이미 사용 중인 반 코드입니다." }, { status: 409 });
      teacher.classes.push({ id: crypto.randomUUID(), name, code });
      return NextResponse.json({ teacher: publicTeacher(await saveTeacher(teacher)) });
    }

    if (action === "addSession") {
      const classId = clean(body.classId);
      const name = clean(body.name);
      if (!teacher.classes.some((classroom) => classroom.id === classId)) {
        return NextResponse.json({ error: "반을 먼저 선택해 주세요." }, { status: 400 });
      }
      if (!name) return NextResponse.json({ error: "숙제 이름을 입력해 주세요." }, { status: 400 });
      teacher.sessions.push({
        id: crypto.randomUUID(),
        classId,
        name,
        answers: [],
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ teacher: publicTeacher(await saveTeacher(teacher)) });
    }

    if (action === "saveAnswers") {
      const session = teacher.sessions.find((item) => item.id === clean(body.sessionId));
      const answers = compact(body.answers);
      if (!session) return NextResponse.json({ error: "숙제를 찾을 수 없습니다." }, { status: 404 });
      if (!answers.length) return NextResponse.json({ error: "정답을 한 개 이상 입력해 주세요." }, { status: 400 });
      session.answers = answers;
      return NextResponse.json({
        teacher: publicTeacher(await saveTeacher(teacher)),
        questionCount: answers.length,
      });
    }

    if (action === "getStats") {
      const session = teacher.sessions.find((item) => item.id === clean(body.sessionId));
      if (!session) return NextResponse.json({ error: "숙제를 찾을 수 없습니다." }, { status: 404 });
      const { blobs } = await list({ prefix: SUBMISSION_PREFIX, limit: 1000 });
      const counts = new Map<number, number>();
      for (const blob of blobs) {
        const item = (await readBlobJson(blob)) as {
          teacherId?: string; sessionId?: string; wrong?: number[];
        } | null;
        if (item?.teacherId !== teacher.id || item.sessionId !== session.id) continue;
        for (const question of item.wrong ?? []) counts.set(question, (counts.get(question) ?? 0) + 1);
      }
      return NextResponse.json({
        stats: [...counts.entries()]
          .map(([question, count]) => ({ question, count }))
          .sort((a, b) => b.count - a.count || a.question - b.question),
      });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (error) {
    return responseError(error);
  }
}
