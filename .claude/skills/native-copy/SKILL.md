---
name: native-copy
description: Write interface copy in a language other than English so that it reads as written in that language, not translated into it. Covers the method (write from the screen's intent, not from the English string), the signs a sentence was translated, the checks before it ships, and one reference file per language for register, typography, fixed vocabulary and known calques. Use before writing or changing any user-visible string outside English, when translating or reviewing a catalog, and when someone says a text sounds wrong. Triggers - "ça sonne faux", "mauvaise traduction", "sounds translated", "write the French", "fix the German copy", "review the translation", any edit to a non-English locale file.
---

# Native copy

You do not translate the English. You write the language.

A sentence carried over word by word keeps the English order, the English idea
and the English idiom. The grammar is right and a native reader still hears it
at once, on every screen, and stops trusting the product. The English string is
the specification of what must be said. It is never the draft.

Load the reference of the language before you write a word:
[`references/fr.md`](references/fr.md). When a language has none, write it
first, from what the platforms publish in that language, and add it in the same
change.

## The method

1. **Read the screen, not the string.** What is the person doing? What must they
   know to go on? What happens when they press? Answer in one line, for yourself.
2. **Close the English.** Say the thing in the target language as one person says
   it to another across a table. Write that sentence down. Then tighten it.
3. **Use the word the reader has already learned.** For the same act, Apple,
   Google, Microsoft, Netflix and Spotify use one fixed word per language. The
   reference file lists them. A new word for a known act reads as a mistake.
4. **Read it aloud.** If nobody would say it that way, write it again. This step
   finds most of the problems.
5. **Check the facts against the English.** The form changes; the promise does
   not. Same numbers, same limits, same placeholders, nothing added, nothing
   dropped. A French sentence may be one sentence where the English had two.
6. **Read the whole screen at once.** Titles, hints and buttons together: one
   voice, one way of addressing the reader, no word used for two things.
7. **Show a native reader when there is one.** Their ear decides, not yours. List
   the strings you are least sure of instead of saying that all of it is good.

## Signs that a sentence was translated

- The product does a human thing: it "speaks to you", it "arrives", it "waits".
- An English idiom is still inside: *be counted*, *get more from*, *you are all set*.
- A noun where the language wants a verb, or the reverse.
- A possessive on every noun, because English put one there.
- A passive, where the language uses an impersonal or an active turn.
- A symbol standing for a word: `+`, `/`, `&`.
- Every string of the screen has the length and the word order of its source.
- A word that exists but that software in that language never uses.

One of these is enough to write the sentence again.

## Rules of form

- **Register and typography** come from the reference file: how the reader is
  addressed, the form of a button, of a title, of an error, the spaces and the
  quotation marks. They are not a matter of taste per string.
- **Placeholders and plurals** follow the project's translation tooling. Keep
  each `{name}` as the source spells it. Give every plural form the language has.
- **Length.** A label has the room of a label. If the natural sentence is too
  long, find a shorter natural sentence. Do not cut words out of a long one.
- **Leave alone** product and brand names, codec and format names, identifiers.
- **A string you cannot write well stays out.** It then reads in the source
  language, which is better than a wrong sentence.

## When you change the source too

If the English is odd, the odd idea follows into every language. Say so, and
propose a plainer English line with the other languages. Each language is then
written from the intent, and none of them from another.

## Report

Give the strings you wrote next to what they replace, the ones you are not sure
of, and the terms you fixed for the language. Record a fixed term in the
reference file, so that the next writer makes the same choice.
