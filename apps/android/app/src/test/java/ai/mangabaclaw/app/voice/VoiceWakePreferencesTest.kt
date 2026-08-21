package ai.mangabaclaw.app.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VoiceWakePreferencesTest {
  @Test
  fun sanitizeTrimsDropsEmptyAndUsesDefaults() {
    assertEquals(listOf("hello", "computer"), VoiceWakePreferences.sanitizeTriggerWords(listOf(" hello ", "", "computer")))
    assertEquals(VoiceWakePreferences.defaultTriggerWords, VoiceWakePreferences.sanitizeTriggerWords(emptyList()))
  }

  @Test
  fun sanitizePreservesPhrasePunctuationAndNewlines() {
    assertEquals(
      listOf("hey, mangabaclaw", "line\nbreak"),
      VoiceWakePreferences.sanitizeTriggerWords(listOf(" hey, mangabaclaw ", "line\nbreak")),
    )
  }

  @Test
  fun matcherRequiresWordBoundariesAndCommand() {
    assertNull(VoiceWakePhraseMatcher.match("remangabaclaw show status", listOf("mangabaclaw")))
    assertNull(VoiceWakePhraseMatcher.match("mangabaclaw", listOf("mangabaclaw")))
    assertNull(VoiceWakePhraseMatcher.match("tell mangabaclaw show status", listOf("mangabaclaw")))
    assertEquals(
      VoiceWakeMatch(trigger = "MangabaClaw", command = "show status"),
      VoiceWakePhraseMatcher.match("Hey MangabaClaw, show status", listOf("mangabaclaw")),
    )
  }

  @Test
  fun matcherUsesEarliestTrigger() {
    assertEquals(
      VoiceWakeMatch(trigger = "computer", command = "ask claude for status"),
      VoiceWakePhraseMatcher.match("computer ask claude for status", listOf("claude", "computer")),
    )
  }

  @Test
  fun matcherSupportsScriptsWithoutWhitespaceWordBoundaries() {
    assertEquals(
      VoiceWakeMatch(trigger = "小龙虾", command = "天气怎么样"),
      VoiceWakePhraseMatcher.match("小龙虾天气怎么样", listOf("小龙虾")),
    )
    assertEquals(
      VoiceWakeMatch(trigger = "โอเพนคลอ", command = "สภาพอากาศ"),
      VoiceWakePhraseMatcher.match("โอเพนคลอสภาพอากาศ", listOf("โอเพนคลอ")),
    )
  }

  @Test
  fun matcherNormalizesSpokenPunctuationAndWhitespace() {
    assertEquals(
      VoiceWakeMatch(trigger = "Hey MangabaClaw", command = "show status"),
      VoiceWakePhraseMatcher.match("Hey MangabaClaw show status", listOf("hey,\nmangabaclaw")),
    )
  }
}
