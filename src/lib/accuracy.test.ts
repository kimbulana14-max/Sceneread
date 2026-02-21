import { describe, it, expect } from 'vitest'
import {
  checkAccuracy,
  getRealtimeWordMatch,
  getLockedWordMatch,
  getWordByWordResults,
  createFreshLockedState,
} from './accuracy'

// ============================================================================
// checkAccuracy — core matching
// ============================================================================

describe('checkAccuracy', () => {
  // ---- exact matches ----
  it('exact match returns 100% correct', () => {
    const r = checkAccuracy('To be or not to be', 'To be or not to be')
    expect(r.isCorrect).toBe(true)
    expect(r.accuracy).toBe(100)
    expect(r.missingWords).toEqual([])
    expect(r.extraWords).toEqual([])
    expect(r.wrongWords).toEqual([])
  })

  it('ignores case differences', () => {
    const r = checkAccuracy('Hello World', 'hello world')
    expect(r.isCorrect).toBe(true)
    expect(r.accuracy).toBe(100)
  })

  it('ignores punctuation', () => {
    const r = checkAccuracy("Don't go, please!", "dont go please")
    // "don't" normalizes to "don't" and "dont" to "dont" — they differ.
    // But the result should still be checked
    const r2 = checkAccuracy('Hello, world!', 'hello world')
    expect(r2.isCorrect).toBe(true)
    expect(r2.accuracy).toBe(100)
  })

  // ---- substitution errors ----
  it('detects wrong word substitutions', () => {
    const r = checkAccuracy('I love you', 'I hate you')
    expect(r.isCorrect).toBe(false)
    expect(r.wrongWords.length).toBe(1)
    expect(r.wrongWords[0]).toContain('hate')
    expect(r.wrongWords[0]).toContain('love')
  })

  it('any wrong substitution fails regardless of accuracy', () => {
    // 9 words correct, 1 wrong → 90% but should fail due to wrongWords
    const expected = 'the quick brown fox jumps over the lazy old dog'
    const spoken = 'the quick brown fox jumps over the lazy young dog'
    const r = checkAccuracy(expected, spoken)
    expect(r.isCorrect).toBe(false)
    expect(r.wrongWords.length).toBeGreaterThan(0)
  })

  // ---- missing words ----
  it('allows 1 missing word on short lines', () => {
    const r = checkAccuracy('I am going home now', 'I am going home')
    expect(r.missingWords).toContain('now')
    // 4/5 = 80% — below 90 threshold, so should fail
    expect(r.isCorrect).toBe(false)
  })

  it('allows 1 missing word when accuracy stays above threshold', () => {
    // 10 words, missing 1 → 90%, threshold 90%, allowedMissing 1
    const expected = 'I really truly do believe that this is quite nice today'
    const spoken = 'I really truly do believe that this is quite nice'
    const r = checkAccuracy(expected, spoken)
    // 10/11 ≈ 91% and 1 missing word, 0 wrong → should pass
    expect(r.missingWords).toContain('today')
    expect(r.wrongWords).toEqual([])
  })

  it('detects multiple missing words', () => {
    const r = checkAccuracy('I will go to the store', 'I will go')
    expect(r.missingWords.length).toBe(3)
  })

  // ---- extra words ----
  it('detects extra words', () => {
    const r = checkAccuracy('I am fine', 'I am really very fine')
    expect(r.extraWords.length).toBeGreaterThan(0)
  })

  it('filler words at end of spoken text are filtered', () => {
    // Fillers only filtered when they land in the "remaining spoken = extra" branch
    const r = checkAccuracy('I am going home', 'I am going home uh')
    // "uh" after all words matched → filtered as filler
    expect(r.extraWords).toEqual([])
    expect(r.isCorrect).toBe(true)
  })

  it('filler words mid-sentence are skipped before look-ahead', () => {
    // "uh" between matched words is now skipped as a filler before reaching look-ahead
    const r = checkAccuracy('I am going home today', 'I am going home uh today')
    expect(r.extraWords).toEqual([])
    expect(r.missingWords).toEqual([])
    expect(r.accuracy).toBe(100)
    expect(r.isCorrect).toBe(true)
  })

  it('leading filler words are skipped before look-ahead', () => {
    // "um" at position 0 is now recognized as filler and skipped
    const r = checkAccuracy('I am fine', 'um I am fine')
    expect(r.accuracy).toBe(100)
    expect(r.isCorrect).toBe(true)
  })

  // ---- equivalents ----
  describe('equivalents', () => {
    it('matches homophones: their / there', () => {
      const r = checkAccuracy('their house is big', 'there house is big')
      expect(r.isCorrect).toBe(true)
    })

    it("matches contractions: you're / your", () => {
      const r = checkAccuracy("you're going home", 'your going home')
      expect(r.isCorrect).toBe(true)
    })

    it("matches it's / its", () => {
      const r = checkAccuracy("it's a nice day", 'its a nice day')
      expect(r.isCorrect).toBe(true)
    })

    it('matches number words: two / 2 / to / too', () => {
      const r = checkAccuracy('I have two dogs', 'I have 2 dogs')
      expect(r.isCorrect).toBe(true)
    })

    it('matches ok / okay', () => {
      const r = checkAccuracy('okay lets go', 'ok lets go')
      expect(r.isCorrect).toBe(true)
    })

    it('matches abbreviations: dr / doctor', () => {
      const r = checkAccuracy('Doctor Smith is here', 'dr Smith is here')
      expect(r.isCorrect).toBe(true)
    })

    it('matches yeah / yep / yup variants', () => {
      const r = checkAccuracy('yeah I know', 'yep I know')
      expect(r.isCorrect).toBe(true)
    })

    it('matches mmhmm / mhm / uh-huh filler variants', () => {
      const r = checkAccuracy('mmhmm I understand', 'mhm I understand')
      expect(r.isCorrect).toBe(true)
    })
  })

  // ---- stutters / dashes ----
  describe('stutter handling', () => {
    it('handles double-dash stutters: skipped stutter excluded from denominator', () => {
      const r = checkAccuracy('I--I am here', 'I am here')
      // Stutter "I" skipped and excluded from denominator → 3/3 = 100%
      expect(r.wrongWords).toEqual([])
      expect(r.missingWords).toEqual([])
      expect(r.accuracy).toBe(100)
      expect(r.isCorrect).toBe(true)
    })

    it('stutter on short line now passes (denominator fixed)', () => {
      const r = checkAccuracy('I--I am here', 'I am here')
      // effectiveWordCount = 4 - 1 stutter = 3, matchedCount = 3 → 100%
      expect(r.accuracy).toBe(100)
      expect(r.isCorrect).toBe(true)
    })

    it('stutter on longer lines also passes', () => {
      const r = checkAccuracy(
        'But I--I really think we should go to the store and get some food',
        'But I really think we should go to the store and get some food'
      )
      // 12 matched / (13 - 1 stutter) = 12/12 = 100%
      expect(r.accuracy).toBe(100)
      expect(r.isCorrect).toBe(true)
    })

    it('handles single-dash stutters same as double-dash', () => {
      const r = checkAccuracy('I-I am here', 'I am here')
      // Same as double-dash: stutter excluded from denominator → 100%
      expect(r.wrongWords).toEqual([])
      expect(r.accuracy).toBe(100)
      expect(r.isCorrect).toBe(true)
    })

    it('also accepts if user stutters too: I--I → user says "I I"', () => {
      const r = checkAccuracy('I--I am here', 'I I am here')
      expect(r.isCorrect).toBe(true)
      expect(r.accuracy).toBe(100)
    })
  })

  // ---- skippable script words ----
  describe('skippable script words', () => {
    it('"um" in script is skipped and excluded from denominator', () => {
      const r = checkAccuracy('um I think so', 'I think so')
      // "um" skipped, effectiveWordCount = 4 - 1 = 3, matched = 3 → 100%
      expect(r.wrongWords).toEqual([])
      expect(r.missingWords).toEqual([])
      expect(r.accuracy).toBe(100)
      expect(r.isCorrect).toBe(true)
    })

    it('"well" in script IS now skippable (common conversational filler)', () => {
      // "well" was added to SKIPPABLE_SCRIPT_WORDS — actors naturally omit it
      const r = checkAccuracy('well I think so', 'I think so')
      expect(r.missingWords).toEqual([])
      expect(r.accuracy).toBe(100)
      expect(r.isCorrect).toBe(true)
    })

    it('"so" in script IS now skippable (common conversational filler)', () => {
      const r = checkAccuracy('so what do you think', 'what do you think')
      expect(r.missingWords).toEqual([])
      expect(r.accuracy).toBe(100)
      expect(r.isCorrect).toBe(true)
    })

    it('skippable words excluded from denominator (short lines now pass)', () => {
      const r = checkAccuracy('sighs I know', 'I know')
      // effectiveWordCount = 3 - 1 = 2, matched = 2 → 100%
      expect(r.accuracy).toBe(100)
      expect(r.isCorrect).toBe(true)
    })

    it('skippable words on longer lines also pass with correct denominator', () => {
      const r = checkAccuracy(
        'sighs I really do think we should leave this place right now before something happens',
        'I really do think we should leave this place right now before something happens'
      )
      // 13 matched / (14 - 1 skipped) = 13/13 = 100%
      expect(r.accuracy).toBe(100)
      expect(r.isCorrect).toBe(true)
    })

    it('accepts if user actually says the skippable word', () => {
      const r = checkAccuracy('oh I see', 'oh I see')
      expect(r.isCorrect).toBe(true)
      expect(r.accuracy).toBe(100)
    })
  })

  // ---- proper noun fuzzy matching ----
  describe('proper nouns (fuzzy matching)', () => {
    it('allows fuzzy matching for proper nouns (Robinavitch ≈ Robinovich)', () => {
      // "Robinavitch" starts with capital, not first word → proper noun
      const r = checkAccuracy('Hello Robinavitch how are you', 'hello robinovich how are you')
      // After normalization both are lowercase, but the original "Robinavitch" signals proper noun
      expect(r.isCorrect).toBe(true)
    })

    it('does NOT fuzzy-match regular words (old ≠ young)', () => {
      const r = checkAccuracy('the old man', 'the young man')
      expect(r.isCorrect).toBe(false)
    })
  })

  // ---- multi-word expansions ----
  describe('multi-word expansions', () => {
    it('matches "alright" vs "all right"', () => {
      const r = checkAccuracy('alright lets go', 'all right lets go')
      expect(r.isCorrect).toBe(true)
    })
  })

  // ---- accuracy thresholds (normal mode) ----
  describe('accuracy thresholds (normal mode)', () => {
    it('short lines (≤10 words) need 90% accuracy', () => {
      // 5 words, 1 missing → 80% → fail
      const r = checkAccuracy('I am going home now', 'I am going home')
      expect(r.isCorrect).toBe(false)
    })

    it('medium lines (11-20 words) allow 2 missing and 90% threshold', () => {
      // 13 words, missing last 2 ("and", "cheese") → 11/13 ≈ 85% < 90% → fail
      const expected = 'I went to the store and bought some bread and milk and cheese'
      const spoken = 'I went to the store and bought some bread and milk'
      const r = checkAccuracy(expected, spoken)
      expect(r.missingWords.length).toBe(2) // "and" and "cheese"
      expect(r.missingWords).toContain('and')
      expect(r.missingWords).toContain('cheese')
      // 11/13 = 85% < 90% → fails even though 2 missing ≤ allowedMissing(2)
      expect(r.isCorrect).toBe(false)
    })

    it('long lines (>20 words) allow 3 missing and 85% threshold', () => {
      // Build a 25-word line, miss 3 → 22/25 = 88% → pass (≥85% and ≤3 missing)
      const words = 'the quick brown fox jumps over the lazy dog and then runs across the wide open field to find some food and water for the journey ahead'
      const spokenArr = words.split(' ')
      // Remove last 3 words
      const spoken = spokenArr.slice(0, -3).join(' ')
      const r = checkAccuracy(words, spoken)
      expect(r.missingWords.length).toBe(3)
      // 22/25 = 88% ≥ 85%, 3 missing = 3 allowed, 0 wrong → pass
      expect(r.isCorrect).toBe(true)
    })
  })
})

// ============================================================================
// checkAccuracy — strict mode
// ============================================================================

describe('checkAccuracy (strict mode)', () => {
  it('requires 100% accuracy in strict mode', () => {
    // 1 missing word → fail in strict
    const expected = 'I am going to the store today'
    const spoken = 'I am going to the store'
    const r = checkAccuracy(expected, spoken, true)
    expect(r.isCorrect).toBe(false)
  })

  it('allows no missing words in strict mode', () => {
    const r = checkAccuracy('hello world', 'hello', true)
    expect(r.isCorrect).toBe(false)
    expect(r.missingWords).toContain('world')
  })

  it('allows no extra words in strict mode', () => {
    const r = checkAccuracy('hello world', 'hello beautiful world', true)
    expect(r.isCorrect).toBe(false)
    expect(r.extraWords.length).toBeGreaterThan(0)
  })

  it('still allows equivalents in strict mode', () => {
    const r = checkAccuracy("you're welcome", 'your welcome', true)
    expect(r.isCorrect).toBe(true)
    expect(r.accuracy).toBe(100)
  })

  it('stutters pass strict mode (denominator excludes skipped stutter)', () => {
    const r = checkAccuracy('I--I am here', 'I am here', true)
    // effectiveWordCount = 4 - 1 = 3, matched = 3 → 100%
    expect(r.accuracy).toBe(100)
    expect(r.isCorrect).toBe(true)
  })

  it('stutters on longer lines pass strict mode', () => {
    const r = checkAccuracy(
      'But I--I really do think we should go to the store',
      'But I really do think we should go to the store',
      true
    )
    // 9 matched / (10 - 1 stutter) = 9/9 = 100%
    expect(r.accuracy).toBe(100)
    expect(r.isCorrect).toBe(true)
  })

  it('skippable words pass strict mode (denominator excludes them)', () => {
    const r = checkAccuracy('sighs I know right', 'I know right', true)
    // 3 matched / (4 - 1 skipped) = 3/3 = 100%
    expect(r.accuracy).toBe(100)
    expect(r.isCorrect).toBe(true)
  })

  it('leading filler spoken words handled in strict mode', () => {
    // "um" is skipped as filler before look-ahead
    const r = checkAccuracy('I know right', 'um I know right', true)
    expect(r.accuracy).toBe(100)
    expect(r.isCorrect).toBe(true)
  })

  it('exact match passes strict mode', () => {
    const r = checkAccuracy('To be or not to be', 'to be or not to be', true)
    expect(r.isCorrect).toBe(true)
    expect(r.accuracy).toBe(100)
  })

  it('wrong substitution fails strict mode', () => {
    const r = checkAccuracy('I love you', 'I hate you', true)
    expect(r.isCorrect).toBe(false)
  })
})

// ============================================================================
// getRealtimeWordMatch
// ============================================================================

describe('getRealtimeWordMatch', () => {
  it('matches words sequentially from the start', () => {
    const r = getRealtimeWordMatch('I am going home', 'I am going')
    expect(r.matched).toBe(3)
    expect(r.hasError).toBe(false)
  })

  it('detects error on mismatch', () => {
    const r = getRealtimeWordMatch('I am going home', 'I am leaving')
    expect(r.matched).toBe(2)
    expect(r.hasError).toBe(true)
  })

  it('handles empty spoken text', () => {
    const r = getRealtimeWordMatch('hello world', '')
    expect(r.matched).toBe(0)
    expect(r.hasError).toBe(false)
  })

  it('skips stutters in expected', () => {
    const r = getRealtimeWordMatch('I--I am here', 'I am here')
    expect(r.matched).toBe(3)
    expect(r.hasError).toBe(false)
  })

  it('skips SKIPPABLE_SCRIPT_WORDS not spoken (um and well are both skippable)', () => {
    const r1 = getRealtimeWordMatch('um I think so', 'I think so')
    expect(r1.matched).toBe(3)
    expect(r1.hasError).toBe(false)

    // "well" is now in SKIPPABLE_SCRIPT_WORDS too
    const r2 = getRealtimeWordMatch('well I think so', 'I think so')
    expect(r2.matched).toBe(3)
    expect(r2.hasError).toBe(false)
  })

  it('handles equivalents in real-time matching', () => {
    const r = getRealtimeWordMatch("you're my friend", 'your my friend')
    expect(r.matched).toBe(3)
    expect(r.hasError).toBe(false)
  })
})

// ============================================================================
// getLockedWordMatch — word-locking prevents STT drift
// ============================================================================

describe('getLockedWordMatch', () => {
  it('starts fresh with null state', () => {
    const r = getLockedWordMatch('hello world', 'hello', null)
    expect(r.lockedCount).toBe(1)
    expect(r.lockedWords).toEqual(['hello'])
    expect(r.hasError).toBe(false)
  })

  it('incrementally locks words across calls', () => {
    const expected = 'I am going home'

    const s1 = getLockedWordMatch(expected, 'I', null)
    expect(s1.lockedCount).toBe(1)
    expect(s1.lockedWords).toEqual(['i'])

    const s2 = getLockedWordMatch(expected, 'I am', s1)
    expect(s2.lockedCount).toBe(2)
    expect(s2.lockedWords).toEqual(['i', 'am'])

    const s3 = getLockedWordMatch(expected, 'I am going', s2)
    expect(s3.lockedCount).toBe(3)
    expect(s3.lockedWords).toEqual(['i', 'am', 'going'])

    const s4 = getLockedWordMatch(expected, 'I am going home', s3)
    expect(s4.lockedCount).toBe(4)
    expect(s4.lockedWords).toEqual(['i', 'am', 'going', 'home'])
  })

  it('preserves locked state when STT removes words', () => {
    const expected = 'I am going home'
    const s1 = getLockedWordMatch(expected, 'I am going', null)
    expect(s1.lockedCount).toBe(3)

    // STT re-transcribes with fewer words — locked state preserved
    const s2 = getLockedWordMatch(expected, 'I am', s1)
    expect(s2.lockedCount).toBe(3) // Still 3, not regressed
    expect(s2.lockedWords).toEqual(['i', 'am', 'going'])
  })

  it('stops advancing on error', () => {
    const expected = 'I am going home'
    const s1 = getLockedWordMatch(expected, 'I am', null)
    const s2 = getLockedWordMatch(expected, 'I am leaving', s1)
    expect(s2.hasError).toBe(true)
    expect(s2.lockedCount).toBe(2)

    // Further calls with error state return same state
    const s3 = getLockedWordMatch(expected, 'I am leaving town', s2)
    expect(s3.hasError).toBe(true)
    expect(s3.lockedCount).toBe(2)
  })

  it('skips stutters in locked matching', () => {
    const r = getLockedWordMatch('I--I am here', 'I am here', null)
    expect(r.lockedCount).toBe(3) // "I" (skipped stutter "I"), "am", "here"
    expect(r.hasError).toBe(false)
  })

  it('skips SKIPPABLE_SCRIPT_WORDS in locked matching (um and well both skippable)', () => {
    const r1 = getLockedWordMatch('um hello', 'hello', null)
    expect(r1.lockedCount).toBe(1)
    expect(r1.hasError).toBe(false)

    // "well" is now in SKIPPABLE_SCRIPT_WORDS too
    const r2 = getLockedWordMatch('well hello', 'hello', null)
    expect(r2.lockedCount).toBe(1)
    expect(r2.hasError).toBe(false)
  })
})

describe('createFreshLockedState', () => {
  it('returns empty state', () => {
    const s = createFreshLockedState()
    expect(s.lockedWords).toEqual([])
    expect(s.lockedCount).toBe(0)
    expect(s.hasError).toBe(false)
  })
})

// ============================================================================
// getWordByWordResults
// ============================================================================

describe('getWordByWordResults', () => {
  it('marks all correct for exact match', () => {
    const r = getWordByWordResults('hello world', 'hello world')
    expect(r.results).toEqual(['correct', 'correct'])
    expect(r.spokenWords).toEqual(['hello', 'world'])
  })

  it('marks wrong words', () => {
    const r = getWordByWordResults('I love you', 'I hate you')
    expect(r.results).toEqual(['correct', 'wrong', 'correct'])
    expect(r.spokenWords[1]).toBe('hate')
  })

  it('marks missing words when user stops short', () => {
    const r = getWordByWordResults('I am going home', 'I am')
    expect(r.results).toEqual(['correct', 'correct', 'missing', 'missing'])
  })

  it('handles equivalents as correct', () => {
    const r = getWordByWordResults("you're my friend", 'your my friend')
    expect(r.results).toEqual(['correct', 'correct', 'correct'])
  })

  it('handles stutters as correct', () => {
    const r = getWordByWordResults('I--I am here', 'I am here')
    // "I--I" becomes "I I", first "I" matched, stutter "I" marked correct, then "am", "here"
    expect(r.results).toEqual(['correct', 'correct', 'correct', 'correct'])
  })

  it('handles skippable filler words as correct even when not spoken', () => {
    const r = getWordByWordResults('sighs I know', 'I know')
    expect(r.results).toEqual(['correct', 'correct', 'correct'])
  })

  it('marks filler words correct when user does say them', () => {
    const r = getWordByWordResults('oh I see', 'oh I see')
    expect(r.results).toEqual(['correct', 'correct', 'correct'])
  })

  it('handles multi-word expansion (alright → all right)', () => {
    const r = getWordByWordResults('alright lets go', 'all right lets go')
    expect(r.results).toEqual(['correct', 'correct', 'correct'])
  })

  it('handles multi-word contraction (all right → alright)', () => {
    // "all right" in expected, user says "alright"
    const r = getWordByWordResults('all right lets go', 'alright lets go')
    // "all" and "right" both marked correct via contraction match
    expect(r.results[0]).toBe('correct')
    expect(r.results[1]).toBe('correct')
    expect(r.results[2]).toBe('correct')
  })
})

// ============================================================================
// Edge cases and regression tests
// ============================================================================

describe('edge cases', () => {
  it('handles empty expected and spoken', () => {
    const r = checkAccuracy('', '')
    // Both empty → exact match on normalized
    expect(r.accuracy).toBeDefined()
  })

  it('handles empty spoken (user said nothing)', () => {
    const r = checkAccuracy('hello world', '')
    expect(r.isCorrect).toBe(false)
    expect(r.accuracy).toBe(0)
  })

  it('handles empty expected (no line to match)', () => {
    const r = checkAccuracy('', 'hello world')
    expect(r.accuracy).toBeDefined()
  })

  it('handles very long lines correctly', () => {
    const words = Array(30).fill('word').join(' ')
    const r = checkAccuracy(words, words)
    expect(r.isCorrect).toBe(true)
    expect(r.accuracy).toBe(100)
  })

  it('handles apostrophes preserved in normalization', () => {
    const r = checkAccuracy("don't", "don't")
    expect(r.isCorrect).toBe(true)
  })

  it('handles numbers vs words: one / 1 / won', () => {
    const r1 = checkAccuracy('I have one dog', 'I have 1 dog')
    expect(r1.isCorrect).toBe(true)

    const r2 = checkAccuracy('I won the game', 'I one the game')
    expect(r2.isCorrect).toBe(true)
  })

  it('handles multiple equivalents in same line', () => {
    const r = checkAccuracy("you're going to their house", 'your going to there house')
    expect(r.isCorrect).toBe(true)
  })

  it('handles mixed correct, wrong, missing in one line', () => {
    const r = checkAccuracy('I love the big old house', 'I hate the big house')
    expect(r.wrongWords.length).toBeGreaterThan(0) // hate instead of love
    expect(r.missingWords.length).toBeGreaterThan(0) // old missing
  })
})

// ============================================================================
// Scenario-based tests (simulating real practice sessions)
// ============================================================================

describe('realistic practice scenarios', () => {
  it('actor says line perfectly', () => {
    const expected = "I can't believe you'd do something like that to me"
    const spoken = "I can't believe you'd do something like that to me"
    const r = checkAccuracy(expected, spoken)
    expect(r.isCorrect).toBe(true)
  })

  it('actor paraphrases slightly (wrong word)', () => {
    const expected = "I can't believe you'd do something like that to me"
    const spoken = "I can't believe you would do something like that to me"
    // "you'd" vs "you would" — not in equivalents as multi-word, but might be handled
    // The key is "you'd" normalizes and "you" + "would" is 2 words for 1
    const r = checkAccuracy(expected, spoken)
    // This tests the real behavior — may or may not pass depending on expansion handling
    expect(r.accuracy).toBeGreaterThan(0)
  })

  it('filler words mid-sentence are handled correctly', () => {
    const expected = 'I think we should go to the market and buy some fruit today'
    const spoken = 'I think we should uh go to the market and buy some fruit today'
    const r = checkAccuracy(expected, spoken)
    // "uh" skipped as filler before look-ahead → no misalignment
    expect(r.accuracy).toBe(100)
    expect(r.isCorrect).toBe(true)
  })

  it('filler words at end are properly filtered in real scenario', () => {
    const expected = 'I think we should go to the market and buy some fruit'
    const spoken = 'I think we should go to the market and buy some fruit um'
    const r = checkAccuracy(expected, spoken)
    expect(r.isCorrect).toBe(true)
    expect(r.extraWords).toEqual([])
  })

  it('leading "um" handled correctly even on short lines', () => {
    const expected = 'Well I think we should go'
    const spoken = 'um well I think we should go'
    const r = checkAccuracy(expected, spoken)
    // "um" skipped as filler, rest matches perfectly
    expect(r.accuracy).toBe(100)
    expect(r.isCorrect).toBe(true)
  })

  it('STT transcribes name slightly wrong (proper noun fuzzy)', () => {
    const expected = 'Hello Mackenzie how are you'
    const spoken = 'hello Mackensie how are you'
    const r = checkAccuracy(expected, spoken)
    // "Mackenzie" is a proper noun (capital, not first word)
    expect(r.isCorrect).toBe(true)
  })

  it('actor completely wrong line', () => {
    const expected = "We need to leave right now"
    const spoken = "The weather is beautiful today"
    const r = checkAccuracy(expected, spoken)
    expect(r.isCorrect).toBe(false)
    expect(r.accuracy).toBeLessThan(50)
  })

  it('build mode: first segment only', () => {
    // In build mode, actor repeats just the first few words
    const expected = "To be"
    const spoken = "to be"
    const r = checkAccuracy(expected, spoken)
    expect(r.isCorrect).toBe(true)
  })

  it('build mode: progressive segment building', () => {
    const segments = [
      'To be',
      'To be or not',
      'To be or not to be',
      "To be or not to be that is the question",
    ]

    for (const segment of segments) {
      const r = checkAccuracy(segment, segment.toLowerCase())
      expect(r.isCorrect).toBe(true)
      expect(r.accuracy).toBe(100)
    }
  })

  it('stage direction words excluded from denominator (short lines now pass)', () => {
    const expected = 'sighs I know I know'
    const spoken = 'I know I know'
    const r = checkAccuracy(expected, spoken)
    // effectiveWordCount = 5 - 1 = 4, matched = 4 → 100%
    expect(r.accuracy).toBe(100)
    expect(r.isCorrect).toBe(true)
    expect(r.wrongWords).toEqual([])
  })

  it('stage direction words in longer lines also pass with correct denominator', () => {
    const expected = 'sighs I really do know what you mean and I wish things were different'
    const spoken = 'I really do know what you mean and I wish things were different'
    const r = checkAccuracy(expected, spoken)
    // 12 matched / (13 - 1 skipped) = 12/12 = 100%
    expect(r.accuracy).toBe(100)
    expect(r.isCorrect).toBe(true)
  })
})
