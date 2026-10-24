// routes/consent.mjs — consent cards over HTTP (lib/consent.mjs). They need no provider; an
// action that does checks for it itself.
//   GET  /api/consent?name=<project>[&all=1]   → { cards }: the waiting ones (all=1: every card)
//   POST /api/consent/answer { name, id, ok, by? }
//        ok true → runs the card's action and answers { card, job }; ok false → { card } declined.
//        Unknown card 404; a card already answered 409.
import { answerCard, listCards } from "../lib/consent.mjs";

const bad = (status, msg) => Object.assign(new Error(msg), { status });
function dirOf(c, name) {
  const pd = c.projectDir(name);
  if (pd.error) throw bad(pd.status, pd.error);
  return pd.dir;
}

export const ROUTES = [
  {
    method: "GET", path: "/api/consent", provider: false,
    handler(c) {
      const dir = dirOf(c, c.q("name"));
      return { cards: listCards(dir, { status: c.q("all") === "1" ? null : "waiting" }) };
    },
  },
  {
    method: "POST", path: "/api/consent/answer", provider: false,
    async handler(c) {
      const b = c.body ?? {};
      const dir = dirOf(c, b.name);
      const { card, result } = await answerCard(dir, b.id, b.ok, { by: b.by ?? "human", ctx: { ...c, name: b.name, dir } });
      return { card, job: result?.job ?? null };
    },
  },
];
