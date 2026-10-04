// What the pixling says. Lines are short (they share a row with the sprite), templated with
// {name}-style slots, and picked so the same line does not come back twice in a row.

export type LineKey =
  | 'hatch'
  | 'hello'
  | 'welcomeBack'
  | 'done'
  | 'doneLong'
  | 'aborted'
  | 'testPass'
  | 'testFail'
  | 'bugSquashed'
  | 'commit'
  | 'push'
  | 'prCreated'
  | 'prMerged'
  | 'danger'
  | 'spicy'
  | 'permission'
  | 'idle'
  | 'error'
  | 'overloaded'
  | 'refusal'
  | 'limit'
  | 'limitUnknown'
  | 'wake'
  | 'tired'
  | 'lateNight'
  | 'levelUp'
  | 'unlock'
  | 'pet'
  | 'rename'
  | 'doze'
  | 'absolutelyRight'
  | 'greatQuestion'
  | 'apology'
  | 'perfect'
  | 'badge'
  | 'streak'
  | 'recap'
  | 'cacheCooling'
  | 'cacheCold'
  | 'cacheLearned'
  | 'share'

const LINES: Record<LineKey, readonly string[]> = {
  hatch: [
    "Hi! I'm {name}. I live here now.",
    "*blinks* ...Are you my developer?",
    "{name}, reporting for duty!",
    "Fresh out of the egg. What are we building?",
  ],
  hello: [
    'Back at it!',
    "Let's ship something.",
    'Morning, code wrangler.',
    'I stretched. I am ready.',
    'New session, who dis?',
  ],
  welcomeBack: ['You were gone {dur}. I counted.', 'Oh! You came back!', 'I kept your seat warm for {dur}.'],
  done: ['Done! Your turn.', 'Ball is in your court.', 'Finished. *bows*', 'All yours.', 'Ta-da!'],
  doneLong: [
    'Done after {dur}. I made tea.',
    "That took {dur}. Claude's tired, I'm tired.",
    '{dur} later... finished!',
    'Wake up! Claude finished ({dur}).',
  ],
  aborted: ['Stopped. Probably for the best.', 'Okay okay, stopping.', 'Brakes engaged.'],
  testPass: [
    'All green! Framing this one.',
    '{passed} passed. Not a single tear.',
    'Tests pass. Ship it? Ship it.',
    'Green across the board!',
    'The tests have spoken: yes.',
  ],
  testFail: [
    'Red. So much red.',
    '{failed} failed. I believe in you. Mostly.',
    'The tests said no.',
    'Oof. {failed} down.',
    'It was working on my machine...',
    'Failure is just success in beta.',
  ],
  bugSquashed: [
    'BUG SQUASHED! {failed} → 0!',
    'From red to green! *happy dance*',
    'Fixed it! (Claude did. I cheered.)',
    'The bug has been defeated!',
  ],
  commit: [
    'Committed! History will remember this.',
    'Saved to the timeline. 📦',
    'Another one for the log.',
    'Commit made. No take-backs. (Well, some.)',
  ],
  push: ['Pushed to {branch}! It is out there now.', 'Up it goes! 🚀', 'Sent to the cloud. Bye, code!'],
  prCreated: ['PR #{pr} is up! Fingers crossed.', 'A pull request! So official.', 'PR opened. Reviewers, assemble!'],
  prMerged: ['PR #{pr} MERGED!', 'Merged! Pop the confetti!', 'It is in main now. Legendary.'],
  danger: [
    'WAIT. {label}?! Hold me.',
    '{label}... are we sure?!',
    'Eep! {label}! Checking twice?',
    "I'm hiding under the desk. ({label})",
  ],
  spicy: ['Ooh, {label}. Spicy.', '{label}? Bold move.', 'Careful with that {label}...'],
  permission: [
    'Psst! Claude needs your OK.',
    'Knock knock! Approval needed.',
    'Your call, boss!',
    'Claude is waiting on you!',
  ],
  idle: ['Still there?', '*taps glass*', 'Hellooo?', 'I can wait. I am very patient.'],
  error: ['Something broke. Not me though.', 'Ow. An error.', 'Hmm. That did not go well.'],
  overloaded: ['The servers are packed. Deep breaths.', 'Busy servers. Even the cloud needs a nap.'],
  refusal: ['Claude said no to that one.', 'That one is off-limits, apparently.'],
  limit: [
    'Out of juice. Napping till {time}.',
    'Limit hit. Wake me at {time}... I will wake Claude.',
    'Rate limited! Back at {time}. Zzz.',
  ],
  limitUnknown: ['Limit hit. Napping... I will check back.', 'Out of juice! Little nap first.'],
  wake: [
    "I'm up! Telling Claude to carry on...",
    'Limit reset! Back to work, everyone!',
    'Rise and shine! Continuing...',
  ],
  tired: ['{n}% of the {window} window used. Pace yourself.', 'We are at {n}%. Getting sleepy...'],
  lateNight: ["It's {time}. Even bugs sleep.", '{time}? Bold.', 'Night shift again, huh.'],
  levelUp: ['Level {level}! I feel... pixelier.', 'LEVEL {level}!', 'Ding! Level {level}.'],
  unlock: ['Unlocked {item}! How do I look?', 'New look: {item}!', 'I got {item}! Fancy.'],
  pet: ['♥', 'Hehe.', 'Again!', '*purrs?*', 'Best developer.', '*happy wiggle*'],
  rename: ['{name}? I love it!', 'Call me {name}!', '{name}. Has a nice ring to it.'],
  doze: ['*yawn*', 'Just resting my eyes...'],
  absolutelyRight: [
    "\"You're absolutely right.\" That's {n} now.",
    'Absolutely right, #{n}. I keep a tally.',
    '*eye roll* Absolutely right number {n}.',
    "You're absolutely right ({n}). Are you though?",
  ],
  greatQuestion: ['Great question, apparently. ({n})', "Ah yes, a 'great question'. #{n}"],
  apology: ['Apologies for the confusion, #{n}. Sure.', 'Another apology. {n} and counting.'],
  perfect: ['"Perfect!" Is it, though? ({n})', 'Perfect! #{n}. Everything is perfect.'],
  badge: ['Badge earned: {item}!', 'New badge: {item}. Shiny.', '{item}! Pinning it on.'],
  streak: ['Day {n} in a row. 🔥', '{n}-day streak! Keep it going.', 'Streak: {n} days. We are unstoppable.'],
  recap: ['{label}', 'Good to see you. {label}'],
  cacheCooling: [
    'Cache cools in {dur}. Reply soon, save tokens.',
    'Psst: the prompt cache expires in {dur}.',
    '{dur} until the cache goes cold!',
  ],
  cacheCold: [
    'Cache went cold. Re-read {n} tokens. 🧊',
    'Brrr. {n} tokens re-cached after {dur}.',
    'Cold start: {n} tokens paid again.',
  ],
  cacheLearned: ['Noted: your cache lives {item}.', 'Your prompt cache lasts {item}. Countdown fixed.'],
  share: ['Saved my card! Show me off.', 'Card printed. I look great.', 'Trading card ready. Post me!'],
}

/** A species' own lines, mixed in with the shared ones. */
export const SPECIES_LINES: Partial<Record<string, Partial<Record<LineKey, readonly string[]>>>> = {
  duck: {
    testFail: ['Explain it to me, line by line. Quack.', 'Have you tried explaining it to a duck?'],
    hello: ['Quack. Ready to listen.'],
    pet: ['Quack!', '*squeak*'],
  },
  cat: {
    testFail: ['*knocks failing test off the table*', 'I am judging this code. Silently.'],
    pet: ['*purr*', 'Mrrp.', '*slow blink*'],
    idle: ['*sits on keyboard*'],
  },
  robot: {
    testPass: ['ASSERTIONS: SATISFIED. BEEP.'],
    testFail: ['ERROR: SADNESS.EXE'],
    pet: ['AFFECTION RECEIVED. BOOP.'],
  },
  cactus: {
    testPass: ['I bloomed a little!'],
    pet: ['Ouch. Worth it.', 'Gently! I am pointy.'],
  },
  owl: {
    lateNight: ['{time}. My favorite hour. Hoo.'],
    testFail: ['Hoo broke the build?'],
  },
  axolotl: {
    testFail: ['It will grow back. Everything does.'],
    pet: ['*smiles wider*'],
  },
  ghost: {
    danger: ['{label}?! I am already dead and that scared me.'],
    pet: ['Your hand went right through me. Sweet.'],
    hello: ['Boo! Did I scare you?'],
  },
  dragon: {
    commit: ['Another treasure for the hoard.'],
    danger: ['{label}? Not on MY branch.'],
    pet: ['*smoke puff*'],
  },
  capybara: {
    hello: ['Hello. No rush.'],
    danger: ['{label}? Hm. Okay.', '*keeps soaking* ({label})'],
    testFail: ['Red tests. The water is still warm, though.'],
    error: ['An error. Anyway.'],
    pet: ['*content squeak*', '*leans into it*'],
  },
  turtle: {
    hello: ['Ah, you return. Let us begin. Slowly.'],
    testFail: ['Patience. Read the stack trace twice.'],
    push: ['Off it goes. I remember when we used FTP.'],
    lateNight: ['{time}. In my day, we slept.'],
    pet: ['*retreats into shell, pleased*'],
  },
  snail: {
    testPass: ['Slow and steady. All green.'],
    done: ['Done. I was never in a hurry.'],
    cacheCooling: ['Slow is fine. Cold is not. Cache cools in {dur}.'],
    cacheCold: ['The cache went cold. I would have kept it warm.'],
    pet: ['*antennae wiggle*', '*leaves a little trail*'],
  },
  penguin: {
    hello: ['Booted. Kernel nominal.'],
    testPass: ['All green! Belly slide!'],
    commit: ['Committed. Linus would approve. Probably.'],
    danger: ['{label}? That is how home directories vanish.'],
    pet: ['*happy flipper flap*'],
  },
  goose: {
    hello: ['HONK. I am here to cause problems.'],
    testFail: ['HONK. Who wrote this?', 'HONK HONK. Bad code detected.'],
    danger: ['{label}? Finally, some chaos. HONK.'],
    absolutelyRight: ['"Absolutely right" #{n}? HONK.'],
    pet: ['*suspicious honk*', '*hisses, affectionately*'],
  },
  rabbit: {
    hello: ['Hi hi hi! What are we doing? Go go go!'],
    done: ['Done! Next! Next! Next!'],
    testPass: ['Green! *does a binky*'],
    idle: ['*thump thump* Hurry up!'],
    pet: ['*nose twitch*', '*happy binky*'],
  },
}

export type Slots = Readonly<Record<string, string | number | null | undefined>>

const recent: string[] = []

const fill = (template: string, slots: Slots): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = slots[key]
    return value === undefined || value === null ? whole : String(value)
  })

/** Picks a line for an event, the species' own included, skipping recent repeats. */
export const say = (key: LineKey, slots: Slots, speciesId: string, random: () => number): string => {
  const pool = [...LINES[key], ...(SPECIES_LINES[speciesId]?.[key] ?? [])]
  // A template whose slot has no value would print the braces: drop it while others remain.
  const usable = pool.filter(t => [...t.matchAll(/\{(\w+)\}/g)].every(m => slots[m[1] ?? ''] !== undefined && slots[m[1] ?? ''] !== null))
  const choices = usable.length > 0 ? usable : pool
  const fresh = choices.filter(t => !recent.includes(t))
  const from = fresh.length > 0 ? fresh : choices
  const template = from[Math.floor(random() * from.length)] ?? choices[0] ?? ''
  recent.push(template)
  if (recent.length > 6) recent.shift()
  return fill(template, slots)
}

export const allLines = (): { key: LineKey; text: string }[] =>
  (Object.keys(LINES) as LineKey[]).flatMap(key => LINES[key].map(text => ({ key, text })))
