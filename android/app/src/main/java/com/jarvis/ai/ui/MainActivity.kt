package com.jarvis.ai.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.jarvis.ai.ai.AiEngine
import com.jarvis.ai.commands.CommandEngine
import com.jarvis.ai.databinding.ActivityMainBinding
import com.jarvis.ai.voice.VoiceEngine
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var aiEngine: AiEngine
    private lateinit var voiceEngine: VoiceEngine
    private lateinit var commandEngine: CommandEngine

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        aiEngine = AiEngine()
        commandEngine = CommandEngine(this)
        voiceEngine = VoiceEngine(this) { result ->
            binding.inputText.setText(result)
            processInput(result)
        }

        binding.sendButton.setOnClickListener {
            val input = binding.inputText.text.toString()
            if (input.isNotEmpty()) {
                processInput(input)
            }
        }

        binding.micButton.setOnClickListener {
            checkPermissionsAndStartListening()
        }

        binding.powerButton.setOnClickListener {
            toggleJarvis()
        }
    }

    private fun toggleJarvis() {
        // Simple toggle logic for power button
        if (binding.statusText.text == "SYSTEM OFFLINE") {
            binding.statusText.text = "SYSTEM ONLINE"
            voiceEngine.speak("JARVIS is online, Sir.")
        } else {
            binding.statusText.text = "SYSTEM OFFLINE"
            voiceEngine.speak("Going offline, Sir.")
        }
    }

    private fun processInput(input: String) {
        binding.statusText.text = "PROCESSING..."
        
        // 1. Check for local commands
        if (commandEngine.executeCommand(input)) {
            binding.statusText.text = "COMMAND EXECUTED"
            binding.outputText.text = "Executing command, Sir."
            return
        }

        // 2. Fallback to AI
        lifecycleScope.launch {
            val response = aiEngine.generateResponse(input)
            binding.statusText.text = "SYSTEM ONLINE"
            if (response != null) {
                binding.outputText.text = response
                voiceEngine.speak(response)
            } else {
                binding.outputText.text = "Error generating response, Sir."
            }
        }
    }

    private fun checkPermissionsAndStartListening() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        } else {
            voiceEngine.startListening()
            binding.statusText.text = "LISTENING..."
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        voiceEngine.shutdown()
    }
}
