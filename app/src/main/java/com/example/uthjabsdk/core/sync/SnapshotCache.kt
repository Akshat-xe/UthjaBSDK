package com.example.uthjabsdk.core.sync

import java.io.File
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.FileOutputStream

data class CachedSnapshotRecord(
    val snapshot: SnapshotV1,
    val rawJson: String,
    val sha256Hex: String,
    val savedAtMillis: Long
)

class SnapshotCache(
    private val baseDir: File
) {
    private val cacheDir = File(baseDir, "snapshot_cache").apply { mkdirs() }
    private val envelopeFile = File(cacheDir, "snapshot_v1.cache")
    private val envelopeTmpFile = File(cacheDir, "snapshot_v1.cache.tmp")
    private val snapshotFile = File(cacheDir, "snapshot_v1.json")
    private val metaFile = File(cacheDir, "snapshot_v1.meta")

    @Synchronized
    fun saveSnapshot(jsonString: String, sha256Hex: String, revision: String): Boolean {
        return try {
            val validated = SnapshotValidator.validate(jsonString) as? ValidationResult.Success
                ?: return false
            if (validated.snapshot.revision != revision ||
                !validated.sha256Hex.equals(sha256Hex, ignoreCase = true)) return false
            cacheDir.mkdirs()
            FileOutputStream(envelopeTmpFile).use { fos ->
                val output = DataOutputStream(fos)
                output.writeInt(1)
                output.writeLong(System.currentTimeMillis())
                writeBytes(output, revision.toByteArray(Charsets.UTF_8))
                writeBytes(output, sha256Hex.toByteArray(Charsets.US_ASCII))
                writeBytes(output, jsonString.toByteArray(Charsets.UTF_8))
                output.flush()
                fos.fd.sync()
            }
            if (!envelopeTmpFile.renameTo(envelopeFile)) return false
            snapshotFile.delete()
            metaFile.delete()
            true
        } catch (_: Exception) {
            false
        }
    }

    @Synchronized
    fun loadCachedSnapshot(): CachedSnapshotRecord? {
        loadEnvelope()?.let { return it }
        return loadLegacySnapshot()
    }

    private fun loadEnvelope(): CachedSnapshotRecord? {
        if (!envelopeFile.isFile) return null
        return try {
            DataInputStream(envelopeFile.inputStream()).use { input ->
                if (input.readInt() != 1) return null
                val savedAtMillis = input.readLong()
                val revision = readBytes(input, 100).toString(Charsets.UTF_8)
                val sha256Hex = readBytes(input, 64).toString(Charsets.US_ASCII)
                val jsonString = readBytes(input, 1_048_576).toString(Charsets.UTF_8)
                if (input.read() != -1) return null
                validatedRecord(jsonString, revision, sha256Hex, savedAtMillis)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun loadLegacySnapshot(): CachedSnapshotRecord? {
        if (!snapshotFile.exists() || !snapshotFile.canRead()) return null

        return try {
            val jsonString = snapshotFile.readText(Charsets.UTF_8)
            val metaLines = if (metaFile.exists()) metaFile.readLines() else emptyList()
            val expectedRevision = metaLines.getOrNull(0) ?: ""
            val expectedSha256 = metaLines.getOrNull(1) ?: ""
            val savedAtMillis = metaLines.getOrNull(2)?.toLongOrNull() ?: snapshotFile.lastModified()

            validatedRecord(jsonString, expectedRevision, expectedSha256, savedAtMillis)
        } catch (_: Exception) {
            null
        }
    }

    private fun validatedRecord(json: String, revision: String, sha: String, savedAt: Long): CachedSnapshotRecord? {
        val validation = SnapshotValidator.validate(json) as? ValidationResult.Success ?: return null
        if (validation.snapshot.revision != revision || !validation.sha256Hex.equals(sha, true)) return null
        return CachedSnapshotRecord(validation.snapshot, json, validation.sha256Hex, savedAt)
    }

    private fun writeBytes(output: DataOutputStream, bytes: ByteArray) {
        output.writeInt(bytes.size)
        output.write(bytes)
    }

    private fun readBytes(input: DataInputStream, maxSize: Int): ByteArray {
        val size = input.readInt()
        require(size in 1..maxSize)
        return ByteArray(size).also { input.readFully(it) }
    }

    @Synchronized
    fun clear() {
        snapshotFile.delete()
        envelopeFile.delete()
        envelopeTmpFile.delete()
        metaFile.delete()
        File(cacheDir, "snapshot_v1.json.tmp").delete()
        File(cacheDir, "snapshot_v1.meta.tmp").delete()
    }
}
