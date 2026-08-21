package ai.mangabaclaw.app.protocol

import org.junit.Assert.assertTrue
import org.junit.Test

class MangabaClawProtocolConstantsTest {
  @Test
  fun generatedCapabilitiesAreUniqueProtocolIds() {
    val values = MangabaClawCapability.entries.map { it.rawValue }

    assertTrue(values.isNotEmpty())
    assertTrue(values.all { it.isNotBlank() && "." !in it })
    assertTrue(values.size == values.toSet().size)
  }

  @Test
  fun generatedCommandGroupsMatchTheirNamespaces() {
    val groups =
      listOf(
        MangabaClawCameraCommand.NamespacePrefix to MangabaClawCameraCommand.entries.map { it.rawValue },
        MangabaClawSmsCommand.NamespacePrefix to MangabaClawSmsCommand.entries.map { it.rawValue },
        MangabaClawTalkCommand.NamespacePrefix to MangabaClawTalkCommand.entries.map { it.rawValue },
        MangabaClawLocationCommand.NamespacePrefix to MangabaClawLocationCommand.entries.map { it.rawValue },
        MangabaClawDeviceCommand.NamespacePrefix to MangabaClawDeviceCommand.entries.map { it.rawValue },
        MangabaClawNotificationsCommand.NamespacePrefix to MangabaClawNotificationsCommand.entries.map { it.rawValue },
        MangabaClawSystemCommand.NamespacePrefix to MangabaClawSystemCommand.entries.map { it.rawValue },
        MangabaClawPhotosCommand.NamespacePrefix to MangabaClawPhotosCommand.entries.map { it.rawValue },
        MangabaClawContactsCommand.NamespacePrefix to MangabaClawContactsCommand.entries.map { it.rawValue },
        MangabaClawCalendarCommand.NamespacePrefix to MangabaClawCalendarCommand.entries.map { it.rawValue },
        MangabaClawMotionCommand.NamespacePrefix to MangabaClawMotionCommand.entries.map { it.rawValue },
        MangabaClawCallLogCommand.NamespacePrefix to MangabaClawCallLogCommand.entries.map { it.rawValue },
      )

    val commands = groups.flatMap { (prefix, values) -> values.onEach { assertTrue(it.startsWith(prefix)) } }
    assertTrue(commands.size == commands.toSet().size)
  }
}
