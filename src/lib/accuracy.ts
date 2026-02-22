/**
 * Line Accuracy Checker for Actors
 * Uses Jaro-Winkler similarity for forgiving speech matching
 * Optimized for transcription errors, accents, and name variations
 */

// ============================================================================
// JARO-WINKLER SIMILARITY
// ============================================================================

/**
 * Jaro similarity between two strings (0 to 1)
 */
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1
  if (s1.length === 0 || s2.length === 0) return 0

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1
  const s1Matches = new Array(s1.length).fill(false)
  const s2Matches = new Array(s2.length).fill(false)

  let matches = 0
  let transpositions = 0

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, s2.length)

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }

  if (matches === 0) return 0

  // Count transpositions
  let k = 0
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  return (
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3
  )
}

/**
 * Jaro-Winkler similarity (0 to 1)
 * Gives bonus for matching prefix (good for names)
 */
function jaroWinkler(s1: string, s2: string, prefixScale = 0.1): number {
  const jaroScore = jaro(s1, s2)
  
  // Find common prefix (up to 4 chars)
  let prefix = 0
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }

  return jaroScore + prefix * prefixScale * (1 - jaroScore)
}

// ============================================================================
// LEVENSHTEIN DISTANCE
// ============================================================================

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}

// ============================================================================
// SOUNDEX
// ============================================================================

function soundex(word: string): string {
  if (!word) return ''
  const upper = word.toUpperCase()
  const first = upper[0]
  const map: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  }
  let code = first
  let prev = map[first] || '0'
  for (let i = 1; i < upper.length && code.length < 4; i++) {
    const digit = map[upper[i]]
    if (digit && digit !== prev) {
      code += digit
    }
    prev = digit || '0'
  }
  return (code + '000').slice(0, 4)
}

// ============================================================================
// EQUIVALENTS (Only transcription-related variations, NOT acting choices)
// ============================================================================

const EQUIVALENTS: Record<string, string[]> = {
  // Abbreviations (Scribe might transcribe either way)
  "dr": ["doctor"], "doctor": ["dr"],
  "mr": ["mister"], "mister": ["mr"],
  "mrs": ["missus"], "missus": ["mrs"],
  "ms": ["miss"], "miss": ["ms"],
  "prof": ["professor"], "professor": ["prof"],
  "st": ["saint"], "saint": ["st"],
  "mt": ["mount"], "mount": ["mt"],
  
  // Homophones (Scribe can't know which spelling is intended)
  "their": ["there", "they're"], "there": ["their", "they're"], "they're": ["their", "there"],
  "your": ["you're"], "you're": ["your"],
  "its": ["it's"], "it's": ["its"],
  "to": ["too", "two", "2"], "too": ["to", "two", "2"], "two": ["to", "too", "2"], "2": ["to", "too", "two"],
  "hear": ["here"], "here": ["hear"],
  "weather": ["whether"], "whether": ["weather"],
  "write": ["right"], "right": ["write"],
  "know": ["no"], "no": ["know"],
  "knew": ["new"], "new": ["knew"],
  "would": ["wood"], "wood": ["would"],
  "wait": ["weight"], "weight": ["wait"],
  "wear": ["where", "ware"], "where": ["wear", "ware"],
  "whose": ["who's"], "who's": ["whose"],
  "for": ["four", "4"], "four": ["for", "4"], "4": ["for", "four"],
  "ate": ["eight", "8"], "eight": ["ate", "8"], "8": ["ate", "eight"],
  "won": ["one", "1"], "one": ["won", "1"], "1": ["won", "one"],
  
  // Common transcription variations
  "ok": ["okay", "k", "kay"], "okay": ["ok", "k", "kay"],
  "alright": ["all right"], "all right": ["alright"],
  
  // Filler word variations (STT transcribes these differently)
  // mm-hmm variations
  "mmm-hmm": ["mhm", "mm-hm", "mmhm", "mm-hmm", "mhmm", "mmhmm", "uh-huh"],
  "mm-hm": ["mhm", "mmm-hmm", "mmhm", "mm-hmm", "mhmm", "mmhmm"],
  "mhm": ["mmm-hmm", "mm-hm", "mmhm", "mm-hmm", "mhmm", "mmhmm"],
  "mmhm": ["mhm", "mmm-hmm", "mm-hm", "mm-hmm", "mhmm", "mmhmm"],
  "mhmm": ["mhm", "mmm-hmm", "mm-hm", "mmhm", "mm-hmm", "mmhmm"],
  "mmhmm": ["mhm", "mmm-hmm", "mm-hm", "mmhm", "mm-hmm", "mhmm"],
  
  // uh-huh variations  
  "uh-huh": ["uhuh", "uh huh", "uhhuh", "ah-huh", "ahuh"],
  "uhuh": ["uh-huh", "uh huh", "uhhuh", "ah-huh"],
  "uhhuh": ["uh-huh", "uhuh", "uh huh", "ah-huh"],
  
  // hmm variations
  "hmm": ["hm", "hmmm", "hmmmm"],
  "hm": ["hmm", "hmmm"],
  "hmmm": ["hmm", "hm", "hmmmm"],
  
  // um variations
  "um": ["umm", "ummm", "uhm"],
  "umm": ["um", "ummm", "uhm"],
  "ummm": ["um", "umm", "uhm"],
  "uhm": ["um", "umm", "ummm"],
  
  // uh variations
  "uh": ["uhh", "uhhh", "er"],
  "uhh": ["uh", "uhhh", "er"],
  "er": ["uh", "uhh"],
  
  // ah variations
  "ah": ["ahh", "ahhh"],
  "ahh": ["ah", "ahhh"],
  
  // yeah variations
  "yeah": ["yea", "ya", "yah", "yep", "yup"],
  "yea": ["yeah", "ya", "yah"],
  "ya": ["yeah", "yea", "yah"],
  "yep": ["yeah", "yup", "yes"],
  "yup": ["yeah", "yep", "yes"],
  
  // nope variations
  "nope": ["nah", "na"],
  "nah": ["nope", "na", "no"],
  "na": ["nah", "nope"],
  
  // Numbers (Scribe might use digits or words) - only ones not covered above
  "three": ["3"], "3": ["three"],
  "five": ["5"], "5": ["five"],
  "six": ["6"], "6": ["six"],
  "seven": ["7"], "7": ["seven"],
  "nine": ["9"], "9": ["nine"],
  "ten": ["10"], "10": ["ten"],
  "first": ["1st"], "1st": ["first"],
  "second": ["2nd"], "2nd": ["second"],
  "third": ["3rd"], "3rd": ["third"],
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Pre-process text to handle stutters and dashes
 * "I--I am" → "I I am" (split on dashes)
 * This allows both "I I am" and "I am" to match
 */
function preprocessStutters(text: string): string {
  return text
    .replace(/--+/g, ' ') // Replace double dashes with space
    .replace(/-/g, ' ')   // Replace single dashes with space (for stutters like "I-I")
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim()
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, '') // Remove punctuation except apostrophes
    .replace(/\s+/g, ' ')
    .trim()
}

function getWords(text: string): string[] {
  return normalize(text).split(' ').filter(w => w.length > 0)
}

// Get words but preserve original form for capitalization check
function getWordsWithOriginal(text: string): { normalized: string; original: string }[] {
  const cleaned = text.replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.split(' ').filter(w => w.length > 0).map(w => ({
    normalized: w.toLowerCase(),
    original: w
  }))
}

// Check if a word is a proper noun (starts with capital letter, not at sentence start)
function isProperNoun(word: string, isFirstWord: boolean): boolean {
  if (!word || word.length === 0) return false
  const startsWithCapital = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()
  // If it's not the first word and starts with capital, it's likely a proper noun
  // Also check for common proper noun patterns (names often have multiple capitals like "McDonald")
  return startsWithCapital && !isFirstWord
}

// Common filler words that should be ignored if extra (user says these but script doesn't have them)
const FILLER_WORDS = ['um', 'uh', 'ah', 'er', 'like', 'well', 'so', 'oh', 'hmm', 'mm', 'hm']

// Filler words/sounds in script that speech recognition might not pick up - skip these in expected
// These are sounds/utterances that are hard for STT to transcribe accurately
const SKIPPABLE_SCRIPT_WORDS = [
  // Thinking sounds
  'um', 'uh', 'ah', 'er', 'ehh', 'uhh', 'ahh', 'umm',
  // Agreement/acknowledgment sounds  
  'mm', 'mmm', 'mmmm', 'hmm', 'hm', 'hmmm',
  'mmhmm', 'mm-hmm', 'mhm', 'uh-huh', 'uhuh', 'uh-uh',
  'mhmm', 'mmhm', 'aha', 'ah-ha',
  // Reactions/emotions (often in parentheticals that became content)
  'sigh', 'sighs', 'sighing',
  'laugh', 'laughs', 'laughing', 'chuckle', 'chuckles',
  'gasp', 'gasps', 'gasping',
  'groan', 'groans', 'groaning',
  'scoff', 'scoffs', 'scoffing',
  'snort', 'snorts', 'snorting',
  'sob', 'sobs', 'sobbing',
  'cough', 'coughs', 'coughing',
  'sniff', 'sniffs', 'sniffing',
  'wheeze', 'wheezes', 'wheezing',
  // Exclamations
  'oh', 'ooh', 'oooh', 'ohhh',
  'ah', 'ahh', 'ahhh',
  'ugh', 'argh', 'aargh',
  'whoa', 'wow', 'woah',
  'huh', 'eh', 'hey', 'ho', 'ha',
  'phew', 'psst', 'shh', 'shush', 'tsk',
  // Beat/pause indicators
  'beat', 'pause', 'then',
  // Common conversational fillers that actors may naturally omit
  'well', 'so',
]

/**
 * Check if two words match
 * - Exact match required for regular words
 * - Fuzzy match (Jaro-Winkler) allowed for proper nouns only
 * - Equivalents (contractions, casual speech) always allowed
 */
function wordsMatch(
  expected: string,
  spoken: string,
  expectedOriginal?: string,
  isFirstWord: boolean = false,
  characterNames?: Set<string>
): boolean {
  // Exact match
  if (expected === spoken) return true

  // Check equivalents (contractions, abbreviations, casual speech)
  const equiv = EQUIVALENTS[expected]
  if (equiv && equiv.includes(spoken)) return true
  const equivSpoken = EQUIVALENTS[spoken]
  if (equivSpoken && equivSpoken.includes(expected)) return true

  // Fuzzy matching for proper nouns OR known character names
  const isName = (expectedOriginal && isProperNoun(expectedOriginal, isFirstWord)) ||
                 (characterNames && characterNames.has(expected))
  if (isName) {
    const similarity = jaroWinkler(expected, spoken)
    if (similarity >= 0.80) return true
  }

  // Edit distance fallback for short words (<=5 chars)
  // Catches "hi"/"bye" won't match (dist 2), but "liv"/"live" (dist 1) will
  if (expected.length <= 5 || spoken.length <= 5) {
    if (levenshtein(expected, spoken) <= 1) return true
  }

  // Edit distance fallback for longer words (6+ chars) - allow distance 2
  // Catches STT artifacts like "corkster"/"corkscrew", "morning"/"mourning"
  if (expected.length >= 6 && spoken.length >= 6) {
    if (levenshtein(expected, spoken) <= 2) return true
  }

  // Phonetic fallback (Soundex) for words >= 2 chars
  // Catches homophones: "scene"/"seen", "knight"/"night"
  if (expected.length >= 2 && spoken.length >= 2) {
    if (soundex(expected) === soundex(spoken)) return true
  }

  return false
}

// ============================================================================
// MAIN ACCURACY CHECK
// ============================================================================

export interface AccuracyResult {
  isCorrect: boolean
  accuracy: number
  missingWords: string[]
  extraWords: string[]
  wrongWords: string[]
}

/**
 * Check accuracy of spoken text vs expected script line
 * Strict matching for regular words, fuzzy only for proper nouns
 */
export function checkAccuracy(expected: string, spoken: string, strictMode: boolean = false, characterNames?: Set<string>): AccuracyResult {
  // Pre-process to handle stutters/dashes in script
  const processedExpected = preprocessStutters(expected)
  const expectedWordsWithOrig = getWordsWithOriginal(processedExpected)
  const expectedWords = expectedWordsWithOrig.map(w => w.normalized)
  const spokenWords = getWords(spoken)
  
  // Quick exact match
  if (expectedWords.join(' ') === spokenWords.join(' ')) {
    return { isCorrect: true, accuracy: 100, missingWords: [], extraWords: [], wrongWords: [] }
  }
  
  const missingWords: string[] = []
  const extraWords: string[] = []
  const wrongWords: string[] = []

  let expectedIdx = 0
  let spokenIdx = 0
  let matchedCount = 0
  let skippedCount = 0

  while (expectedIdx < expectedWords.length && spokenIdx < spokenWords.length) {
    const expWord = expectedWords[expectedIdx]
    const expOrig = expectedWordsWithOrig[expectedIdx].original
    const spkWord = spokenWords[spokenIdx]
    const isFirstWord = expectedIdx === 0

    // Skip filler words in expected that Scribe might not pick up (um, uh, mmhmm, etc.)
    if (SKIPPABLE_SCRIPT_WORDS.includes(expWord) && !wordsMatch(expWord, spkWord, expOrig, isFirstWord, characterNames)) {
      // Scribe didn't pick up this filler, skip it - don't count as missing or in denominator
      expectedIdx++
      skippedCount++
      continue
    }

    // Skip repeated stutters - if this word is same as previous, user can skip it
    // e.g., "I--I am" becomes "I I am", user can say "I am" and skip the repeated "I"
    if (expectedIdx > 0 && expWord === expectedWords[expectedIdx - 1] && !wordsMatch(expWord, spkWord, expOrig, isFirstWord, characterNames)) {
      // This is a repeated word (stutter), skip it - don't count in denominator
      expectedIdx++
      skippedCount++
      continue
    }

    // Direct match (strict for regular words, fuzzy for proper nouns)
    if (wordsMatch(expWord, spkWord, expOrig, isFirstWord, characterNames)) {
      matchedCount++
      expectedIdx++
      spokenIdx++
      continue
    }

    // Compound word: spoken "cork screw" → expected "corkscrew"
    if (spokenIdx + 1 < spokenWords.length) {
      const joined = spkWord + spokenWords[spokenIdx + 1]
      if (wordsMatch(expWord, joined, expOrig, isFirstWord, characterNames)) {
        matchedCount++
        expectedIdx++
        spokenIdx += 2
        continue
      }
    }

    // Split word: expected "corkscrew" vs spoken merged, or two expected words merged into one spoken
    if (expectedIdx + 1 < expectedWords.length) {
      const joinedExp = expWord + expectedWords[expectedIdx + 1]
      if (wordsMatch(joinedExp, spkWord, expOrig, isFirstWord, characterNames)) {
        matchedCount += 2
        expectedIdx += 2
        spokenIdx++
        continue
      }
    }

    // Check multi-word expansions (e.g., "i'm" vs "i am")
    const expExpansions = EQUIVALENTS[expWord] || []
    let foundExpansion = false

    for (const expansion of expExpansions) {
      const expWords = expansion.split(' ')
      if (expWords.length > 1) {
        const spokenSlice = spokenWords.slice(spokenIdx, spokenIdx + expWords.length)
        if (spokenSlice.join(' ') === expansion) {
          matchedCount++
          expectedIdx++
          spokenIdx += expWords.length
          foundExpansion = true
          break
        }
      }
    }
    if (foundExpansion) continue

    // Reverse: spoken is contracted, expected is expanded
    const spkExpansions = EQUIVALENTS[spkWord] || []
    let foundContraction = false

    for (const expansion of spkExpansions) {
      const expWords = expansion.split(' ')
      if (expWords.length > 1) {
        const expectedSlice = expectedWords.slice(expectedIdx, expectedIdx + expWords.length)
        if (expectedSlice.join(' ') === expansion) {
          matchedCount++
          expectedIdx += expWords.length
          spokenIdx++
          foundContraction = true
          break
        }
      }
    }
    if (foundContraction) continue

    // Skip filler words in spoken (user says "um", "uh" etc. mid-sentence)
    // Must be checked BEFORE look-ahead to prevent alignment disruption
    if (FILLER_WORDS.includes(spkWord)) {
      spokenIdx++
      continue
    }

    // No match - look ahead to determine if insertion, deletion, or substitution
    const lookAhead = 3
    let foundExpectedAhead = -1
    let foundSpokenAhead = -1

    for (let i = 1; i <= lookAhead && expectedIdx + i < expectedWords.length; i++) {
      const aheadOrig = expectedWordsWithOrig[expectedIdx + i].original
      if (wordsMatch(expectedWords[expectedIdx + i], spkWord, aheadOrig, false, characterNames)) {
        foundExpectedAhead = i
        break
      }
    }

    for (let i = 1; i <= lookAhead && spokenIdx + i < spokenWords.length; i++) {
      if (wordsMatch(spokenWords[spokenIdx + i], expWord, expOrig, isFirstWord, characterNames)) {
        foundSpokenAhead = i
        break
      }
    }

    if (foundExpectedAhead === -1 && foundSpokenAhead === -1) {
      // Substitution
      wrongWords.push(`"${spkWord}" instead of "${expWord}"`)
      expectedIdx++
      spokenIdx++
    } else if (foundSpokenAhead !== -1 && (foundExpectedAhead === -1 || foundSpokenAhead <= foundExpectedAhead)) {
      // Missing word
      missingWords.push(expWord)
      expectedIdx++
    } else {
      // Extra word - but ignore filler words
      if (!FILLER_WORDS.includes(spkWord)) {
        extraWords.push(spkWord)
      }
      spokenIdx++
    }
  }

  // Remaining expected = missing (but skip stutters and skippable words)
  while (expectedIdx < expectedWords.length) {
    const word = expectedWords[expectedIdx]
    if (SKIPPABLE_SCRIPT_WORDS.includes(word) ||
        (expectedIdx > 0 && word === expectedWords[expectedIdx - 1])) {
      skippedCount++
    } else {
      missingWords.push(word)
    }
    expectedIdx++
  }

  // Remaining spoken = extra (ignore fillers)
  while (spokenIdx < spokenWords.length) {
    if (!FILLER_WORDS.includes(spokenWords[spokenIdx])) {
      extraWords.push(spokenWords[spokenIdx])
    }
    spokenIdx++
  }

  // Calculate accuracy using effective word count (excluding skipped stutters/fillers)
  const effectiveWordCount = expectedWords.length - skippedCount
  const accuracy = effectiveWordCount > 0 ? Math.round((matchedCount / effectiveWordCount) * 100) : 100

  // Scale tolerance based on effective line length and strict mode
  const wordCount = effectiveWordCount
  const allowedMissing = strictMode ? 0 : (wordCount > 20 ? 3 : wordCount > 10 ? 2 : 1)
  const allowedExtra = strictMode ? 0 : (wordCount > 20 ? 3 : wordCount > 10 ? 2 : 1)
  const minAccuracy = strictMode ? 100 : (wordCount > 20 ? 85 : 90)

  // Pass criteria:
  // - No wrong substitutions (saying "old" instead of "young" is always a fail)
  // - Meet minimum accuracy threshold (scales with line length, or 100% in strict mode)
  // - Within allowed missing/extra words (0 in strict mode)
  const isCorrect =
    wrongWords.length === 0 &&
    accuracy >= minAccuracy &&
    missingWords.length <= allowedMissing &&
    extraWords.length <= allowedExtra
  
  return { isCorrect, accuracy, missingWords, extraWords, wrongWords }
}

// ============================================================================
// REAL-TIME WORD MATCHING (for live highlighting)
// ============================================================================

export function getRealtimeWordMatch(expected: string, spoken: string, characterNames?: Set<string>): { matched: number; hasError: boolean } {
  // Pre-process to handle stutters/dashes in script
  const processedExpected = preprocessStutters(expected)
  const expectedWordsWithOrig = getWordsWithOriginal(processedExpected)
  const expectedWords = expectedWordsWithOrig.map(w => w.normalized)
  const spokenWords = getWords(spoken)
  
  let matched = 0
  let hasError = false
  let expectedIdx = 0
  let spokenIdx = 0
  
  while (spokenIdx < spokenWords.length && expectedIdx < expectedWords.length) {
    const expWord = expectedWords[expectedIdx]
    const expOrig = expectedWordsWithOrig[expectedIdx].original
    const spkWord = spokenWords[spokenIdx]
    const isFirstWord = expectedIdx === 0
    
    // Skip stutters - if this expected word is same as previous, and doesn't match spoken, skip it
    if (expectedIdx > 0 && expWord === expectedWords[expectedIdx - 1] && !wordsMatch(expWord, spkWord, expOrig, isFirstWord, characterNames)) {
      expectedIdx++
      continue
    }
    
    // Skip filler words in expected
    if (SKIPPABLE_SCRIPT_WORDS.includes(expWord) && !wordsMatch(expWord, spkWord, expOrig, isFirstWord, characterNames)) {
      expectedIdx++
      continue
    }
    
    if (wordsMatch(expWord, spkWord, expOrig, isFirstWord, characterNames)) {
      matched++
      expectedIdx++
      spokenIdx++
    } else {
      hasError = true
      break
    }
  }
  
  return { matched, hasError }
}

// ============================================================================
// SUBSEQUENCE MATCHING (for Deepgram streaming real-time highlighting)
// Uses LCS to find best mapping — allows gaps without stopping
// ============================================================================

export interface SubsequenceMatchResult {
  matchedIndices: Set<number>  // Indices into expected words that matched
  matchedCount: number
  coverage: number             // 0-1 ratio of matched / effective expected words
}

/**
 * Subsequence word match using Longest Common Subsequence (LCS).
 * Unlike sequential locking, this allows gaps — word 4 being wrong
 * doesn't prevent words 5-10 from turning green.
 *
 * @param expected - The expected line from the script
 * @param spoken - Accumulated transcript from Deepgram (finals + partial)
 * @param characterNames - Optional set of character names for fuzzy matching
 * @returns Set of matched expected-word indices + coverage ratio
 */
export function getSubsequenceWordMatch(
  expected: string,
  spoken: string,
  characterNames?: Set<string>
): SubsequenceMatchResult {
  const processedExpected = preprocessStutters(expected)
  const expectedWordsWithOrig = getWordsWithOriginal(processedExpected)
  const expectedWords = expectedWordsWithOrig.map(w => w.normalized)
  const spokenWords = getWords(spoken)

  const matchedIndices = new Set<number>()

  // Auto-match skippable script words and stutters
  let skippedCount = 0
  for (let i = 0; i < expectedWords.length; i++) {
    const w = expectedWords[i]
    if (SKIPPABLE_SCRIPT_WORDS.includes(w)) {
      matchedIndices.add(i)
      skippedCount++
    } else if (i > 0 && w === expectedWords[i - 1]) {
      // Stutter repeat — auto-match
      matchedIndices.add(i)
      skippedCount++
    }
  }

  if (spokenWords.length === 0) {
    const effectiveCount = expectedWords.length - skippedCount
    return {
      matchedIndices,
      matchedCount: 0,
      coverage: effectiveCount > 0 ? 0 : 1,
    }
  }

  // Filter to only non-skipped expected words for LCS
  const expIndices: number[] = [] // Maps LCS row → original expected index
  for (let i = 0; i < expectedWords.length; i++) {
    if (!matchedIndices.has(i)) {
      expIndices.push(i)
    }
  }

  // Filter out filler words from spoken
  const filteredSpoken: string[] = []
  for (const w of spokenWords) {
    if (!FILLER_WORDS.includes(w)) {
      filteredSpoken.push(w)
    }
  }

  const m = expIndices.length
  const n = filteredSpoken.length

  if (m === 0) {
    return { matchedIndices, matchedCount: 0, coverage: 1 }
  }
  if (n === 0) {
    return { matchedIndices, matchedCount: 0, coverage: 0 }
  }

  // Build match matrix (boolean: do these words match?)
  // Then run LCS with backtracking
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    const ei = expIndices[i - 1]
    const expWord = expectedWords[ei]
    const expOrig = expectedWordsWithOrig[ei].original
    const isFirst = ei === 0
    for (let j = 1; j <= n; j++) {
      if (wordsMatch(expWord, filteredSpoken[j - 1], expOrig, isFirst, characterNames)) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find which expected indices matched
  let i = m, j = n
  while (i > 0 && j > 0) {
    const ei = expIndices[i - 1]
    const expWord = expectedWords[ei]
    const expOrig = expectedWordsWithOrig[ei].original
    const isFirst = ei === 0
    if (wordsMatch(expWord, filteredSpoken[j - 1], expOrig, isFirst, characterNames)) {
      matchedIndices.add(ei)
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  const realMatched = matchedIndices.size - skippedCount
  const effectiveCount = expectedWords.length - skippedCount
  const coverage = effectiveCount > 0 ? realMatched / effectiveCount : 1

  return {
    matchedIndices,
    matchedCount: realMatched,
    coverage,
  }
}

// ============================================================================
// WORD-LOCKING REAL-TIME MATCHING
// Prevents STT from "un-matching" words by re-transcribing them
// ============================================================================

export interface LockedWordState {
  lockedWords: string[]      // Words we've locked as "correct"
  lockedCount: number        // Number of expected words matched
  hasError: boolean          // Whether we've hit an error
}

/**
 * Get locked word match with state preservation
 * 
 * Key insight: Once we match a word against the script, we "lock" it.
 * If STT later re-transcribes and changes that word, we ignore the change
 * and only look at NEW words beyond our locked position.
 * 
 * @param expected - The expected line from the script
 * @param spoken - Full transcript from STT  
 * @param prevState - Previous locked state (or null for fresh start)
 * @returns New state with updated locked words
 */
export function getLockedWordMatch(
  expected: string,
  spoken: string,
  prevState: LockedWordState | null,
  characterNames?: Set<string>
): LockedWordState {
  // Pre-process expected text
  const processedExpected = preprocessStutters(expected)
  const expectedWordsWithOrig = getWordsWithOriginal(processedExpected)
  const expectedWords = expectedWordsWithOrig.map(w => w.normalized)
  const spokenWords = getWords(spoken)
  
  // If no previous state, start fresh
  if (!prevState) {
    prevState = { lockedWords: [], lockedCount: 0, hasError: false }
  }
  
  // If we already have an error, don't process further
  if (prevState.hasError) {
    return prevState
  }
  
  // Start from where we left off
  let lockedWords = [...prevState.lockedWords]
  let lockedCount = prevState.lockedCount
  let hasError = false
  
  // Find how many spoken words we should skip (already locked)
  // We match locked words to the START of spoken words
  let spokenStartIdx = 0
  
  // If we have fewer spoken words than locked, STT removed words - use what we have
  if (spokenWords.length < lockedWords.length) {
    // STT removed some words - keep our locked state but don't advance
    return prevState
  }
  
  // Skip past the locked portion of spoken words
  spokenStartIdx = lockedWords.length
  
  // Now try to match NEW spoken words against remaining expected words
  let expectedIdx = lockedCount
  let spokenIdx = spokenStartIdx
  
  while (spokenIdx < spokenWords.length && expectedIdx < expectedWords.length) {
    const expWord = expectedWords[expectedIdx]
    const expOrig = expectedWordsWithOrig[expectedIdx].original
    const spkWord = spokenWords[spokenIdx]
    const isFirstWord = expectedIdx === 0
    
    // Skip stutters in expected
    if (expectedIdx > 0 && expWord === expectedWords[expectedIdx - 1] && !wordsMatch(expWord, spkWord, expOrig, isFirstWord, characterNames)) {
      expectedIdx++
      continue
    }
    
    // Skip filler words in expected
    if (SKIPPABLE_SCRIPT_WORDS.includes(expWord) && !wordsMatch(expWord, spkWord, expOrig, isFirstWord, characterNames)) {
      expectedIdx++
      continue
    }
    
    if (wordsMatch(expWord, spkWord, expOrig, isFirstWord, characterNames)) {
      // Match! Lock this word
      lockedWords.push(spkWord)
      lockedCount++
      expectedIdx++
      spokenIdx++
    } else {
      // Mismatch - mark error and stop
      hasError = true
      break
    }
  }
  
  return { lockedWords, lockedCount, hasError }
}

/**
 * Reset locked state (call when starting a new line)
 */
export function createFreshLockedState(): LockedWordState {
  return { lockedWords: [], lockedCount: 0, hasError: false }
}

/**
 * Get word-by-word comparison results
 * Returns an array with a result for each expected word: 'correct', 'wrong', or 'missing'
 * 
 * @param expected - The expected line from the script
 * @param spoken - Full transcript from STT
 * @returns Array of results per expected word, plus the spoken word for wrong answers
 */
export interface WordByWordResult {
  results: Array<'correct' | 'wrong' | 'missing'>
  spokenWords: string[] // What user actually said (aligned to expected)
}

export function getWordByWordResults(expected: string, spoken: string, characterNames?: Set<string>): WordByWordResult {
  const processedExpected = preprocessStutters(expected)
  const expectedWordsWithOrig = getWordsWithOriginal(processedExpected)
  const expectedWords = expectedWordsWithOrig.map(w => w.normalized)
  const spokenWords = getWords(spoken)
  
  const results: Array<'correct' | 'wrong' | 'missing'> = []
  const alignedSpoken: string[] = []
  
  let expectedIdx = 0
  let spokenIdx = 0
  
  while (expectedIdx < expectedWords.length) {
    const expWord = expectedWords[expectedIdx]
    const expOrig = expectedWordsWithOrig[expectedIdx].original
    const isFirstWord = expectedIdx === 0
    
    // Skip stutters in expected
    if (expectedIdx > 0 && expWord === expectedWords[expectedIdx - 1]) {
      // This is a stutter repeat - mark as correct if we're past it
      if (spokenIdx > 0 || (spokenIdx < spokenWords.length && wordsMatch(expWord, spokenWords[spokenIdx], expOrig, isFirstWord, characterNames))) {
        results.push('correct')
        alignedSpoken.push(expWord) // Use expected word for stutters
        expectedIdx++
        continue
      }
    }
    
    // Skip filler words in expected that might not be transcribed
    if (SKIPPABLE_SCRIPT_WORDS.includes(expWord)) {
      if (spokenIdx < spokenWords.length && wordsMatch(expWord, spokenWords[spokenIdx], expOrig, isFirstWord, characterNames)) {
        // User said the filler
        results.push('correct')
        alignedSpoken.push(spokenWords[spokenIdx])
        spokenIdx++
      } else {
        // Filler not transcribed - treat as correct (skippable)
        results.push('correct')
        alignedSpoken.push(expWord)
      }
      expectedIdx++
      continue
    }
    
    // No more spoken words - rest are missing
    if (spokenIdx >= spokenWords.length) {
      results.push('missing')
      alignedSpoken.push('')
      expectedIdx++
      continue
    }
    
    const spkWord = spokenWords[spokenIdx]
    
    // Check for match
    if (wordsMatch(expWord, spkWord, expOrig, isFirstWord, characterNames)) {
      results.push('correct')
      alignedSpoken.push(spkWord)
      expectedIdx++
      spokenIdx++
      continue
    }

    // Compound word: spoken "cork screw" → expected "corkscrew"
    if (spokenIdx + 1 < spokenWords.length) {
      const joined = spkWord + spokenWords[spokenIdx + 1]
      if (wordsMatch(expWord, joined, expOrig, isFirstWord, characterNames)) {
        results.push('correct')
        alignedSpoken.push(joined)
        expectedIdx++
        spokenIdx += 2
        continue
      }
    }

    // Split word: two expected words merged into one spoken word
    if (expectedIdx + 1 < expectedWords.length) {
      const joinedExp = expWord + expectedWords[expectedIdx + 1]
      if (wordsMatch(joinedExp, spkWord, expOrig, isFirstWord, characterNames)) {
        results.push('correct')
        alignedSpoken.push(spkWord)
        expectedIdx++
        // Mark second expected word as correct too
        results.push('correct')
        alignedSpoken.push('')
        expectedIdx++
        spokenIdx++
        continue
      }
    }

    // Check multi-word expansions (e.g., "i'm" vs "i am")
    const expExpansions = EQUIVALENTS[expWord] || []
    let foundExpansion = false

    for (const expansion of expExpansions) {
      const expWords = expansion.split(' ')
      if (expWords.length > 1) {
        const spokenSlice = spokenWords.slice(spokenIdx, spokenIdx + expWords.length)
        if (spokenSlice.join(' ') === expansion) {
          results.push('correct')
          alignedSpoken.push(spokenSlice.join(' '))
          expectedIdx++
          spokenIdx += expWords.length
          foundExpansion = true
          break
        }
      }
    }
    if (foundExpansion) continue

    // Check multi-word contractions (e.g., "i am" vs "i'm")
    const spkExpansions = EQUIVALENTS[spkWord] || []
    for (const expansion of spkExpansions) {
      const expWords = expansion.split(' ')
      if (expWords.length > 1) {
        const expectedSlice = expectedWords.slice(expectedIdx, expectedIdx + expWords.length)
        if (expectedSlice.join(' ') === expansion) {
          // Mark all words in the expansion as correct
          for (let i = 0; i < expWords.length; i++) {
            results.push('correct')
            alignedSpoken.push(i === 0 ? spkWord : '')
          }
          expectedIdx += expWords.length
          spokenIdx++
          foundExpansion = true
          break
        }
      }
    }
    if (foundExpansion) continue
    
    // Not a match - mark as wrong and show what they said
    results.push('wrong')
    alignedSpoken.push(spkWord)
    expectedIdx++
    spokenIdx++
  }
  
  return { results, spokenWords: alignedSpoken }
}
