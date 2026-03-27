package com.jarvis.ai.utils

object Constants {
    const val GEMINI_MODEL = "gemini-1.5-flash" // Standard for Android SDK
    const val SYSTEM_INSTRUCTION = """
        You are JARVIS, a highly sophisticated AI assistant for a mobile phone. 
        Your tone is professional, British, slightly witty, and always helpful. 
        You have access to mobile phone systems. 
        Address the user as 'Sir' or 'Ma'am'.
    """
    
    // API Key should be handled securely, e.g., via BuildConfig or local.properties
    const val API_KEY = "YOUR_API_KEY_HERE"
}
