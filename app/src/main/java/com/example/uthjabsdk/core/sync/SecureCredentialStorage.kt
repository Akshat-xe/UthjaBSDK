package com.example.uthjabsdk.core.sync

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface SecureCredentialStorage {
    fun getEndpointUrl(): String?
    fun setEndpointUrl(url: String?)
    fun getReadToken(): String?
    fun setReadToken(token: String?)
    fun clear()
    fun isKeystoreProtected(): Boolean
}

class AndroidKeystoreSecretStorage(
    private val context: Context
) : SecureCredentialStorage {

    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "uth_keystore_token_key_v1"
        private const val PREFS_NAME = "uth_pairing_creds"
        private const val PREF_ENDPOINT = "endpoint_url"
        private const val PREF_TOKEN_CIPHERTEXT = "token_ciphertext"
        private const val PREF_TOKEN_IV = "token_iv"
        private const val AES_GCM_NO_PADDING = "AES/GCM/NoPadding"
        private const val GCM_IV_LENGTH_BYTES = 12
        private const val GCM_TAG_LENGTH_BITS = 128
    }

    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    override fun isKeystoreProtected(): Boolean = true

    override fun getEndpointUrl(): String? {
        val endpoint = prefs.getString(PREF_ENDPOINT, null)?.trim()
        return if (endpoint.isNullOrBlank()) null else endpoint
    }

    override fun setEndpointUrl(url: String?) {
        val trimmed = url?.trim()
        if (trimmed.isNullOrBlank()) {
            prefs.edit().remove(PREF_ENDPOINT).apply()
        } else {
            prefs.edit().putString(PREF_ENDPOINT, trimmed).apply()
        }
    }

    override fun getReadToken(): String? {
        val ivBase64 = prefs.getString(PREF_TOKEN_IV, null) ?: return null
        val cipherBase64 = prefs.getString(PREF_TOKEN_CIPHERTEXT, null) ?: return null

        return try {
            val iv = Base64.decode(ivBase64, Base64.NO_WRAP)
            val cipherText = Base64.decode(cipherBase64, Base64.NO_WRAP)

            val secretKey = getOrCreateKey()
            val cipher = Cipher.getInstance(AES_GCM_NO_PADDING)
            val spec = GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv)
            cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)

            val plainBytes = cipher.doFinal(cipherText)
            String(plainBytes, Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }

    override fun setReadToken(token: String?) {
        val trimmed = token?.trim()
        if (trimmed.isNullOrBlank()) {
            prefs.edit()
                .remove(PREF_TOKEN_IV)
                .remove(PREF_TOKEN_CIPHERTEXT)
                .apply()
            return
        }

        try {
            val secretKey = getOrCreateKey()
            val cipher = Cipher.getInstance(AES_GCM_NO_PADDING)
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)
            val iv = cipher.iv
            val cipherText = cipher.doFinal(trimmed.toByteArray(Charsets.UTF_8))

            val ivBase64 = Base64.encodeToString(iv, Base64.NO_WRAP)
            val cipherBase64 = Base64.encodeToString(cipherText, Base64.NO_WRAP)

            prefs.edit()
                .putString(PREF_TOKEN_IV, ivBase64)
                .putString(PREF_TOKEN_CIPHERTEXT, cipherBase64)
                .apply()
        } catch (_: Exception) {
            // Log/handle safely without leaking sensitive payload
        }
    }

    override fun clear() {
        prefs.edit().clear().apply()
    }

    @Synchronized
    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
        keyStore.load(null)

        if (keyStore.containsAlias(KEY_ALIAS)) {
            val entry = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
            if (entry != null) {
                return entry.secretKey
            }
        }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            KEYSTORE_PROVIDER
        )
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()

        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }
}

/**
 * In-memory secure credential storage for pure JVM unit tests and test isolation.
 */
class InMemoryCredentialStorage(
    private var endpointUrl: String? = null,
    private var readToken: String? = null
) : SecureCredentialStorage {

    override fun getEndpointUrl(): String? = endpointUrl
    override fun setEndpointUrl(url: String?) {
        endpointUrl = url?.trim()?.ifBlank { null }
    }

    override fun getReadToken(): String? = readToken
    override fun setReadToken(token: String?) {
        readToken = token?.trim()?.ifBlank { null }
    }

    override fun clear() {
        endpointUrl = null
        readToken = null
    }

    override fun isKeystoreProtected(): Boolean = false
}
