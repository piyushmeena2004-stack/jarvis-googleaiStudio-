package com.jarvis.ai.ai

import com.google.ai.client.generativeai.GenerativeModel
import com.google.ai.client.generativeai.type.content
import com.jarvis.ai.utils.Constants
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AiEngine {
    private val generativeModel = GenerativeModel(
        modelName = Constants.GEMINI_MODEL,
        apiKey = Constants.API_KEY,
        systemInstruction = content { text(Constants.SYSTEM_INSTRUCTION) }
    )

    private val chat = generativeModel.startChat()

    suspend fun generateResponse(prompt: String): String? = withContext(Dispatchers.IO) {
        try {
            val response = chat.sendMessage(prompt)
            response.text
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}
