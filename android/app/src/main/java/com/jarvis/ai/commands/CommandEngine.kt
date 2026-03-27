package com.jarvis.ai.commands

import android.content.Context
import android.content.Intent
import android.net.Uri

class CommandEngine(private val context: Context) {
    fun executeCommand(command: String): Boolean {
        val lowerCommand = command.lowercase()
        
        return when {
            lowerCommand.contains("open youtube") -> {
                openApp("com.google.android.youtube")
                true
            }
            lowerCommand.contains("search") -> {
                val query = lowerCommand.substringAfter("search").trim()
                searchWeb(query)
                true
            }
            lowerCommand.contains("open maps") -> {
                openApp("com.google.android.apps.maps")
                true
            }
            else -> false
        }
    }

    private fun openApp(packageName: String) {
        val intent = context.packageManager.getLaunchIntentForPackage(packageName)
        if (intent != null) {
            context.startActivity(intent)
        }
    }

    private fun searchWeb(query: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=$query"))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }
}
