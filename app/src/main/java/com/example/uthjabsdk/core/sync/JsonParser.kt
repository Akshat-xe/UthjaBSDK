package com.example.uthjabsdk.core.sync

/**
 * Lightweight, zero-dependency JSON parser and serializer.
 * Avoids Android SDK stubs in JVM unit tests and handles SnapshotV1 & local action persistence.
 */
object JsonParser {

    fun parse(json: String): Any? {
        val lexer = JsonLexer(json)
        val value = parseValue(lexer)
        lexer.skipWhitespace()
        if (lexer.hasMore()) {
            throw IllegalArgumentException("Unexpected trailing token at position ${lexer.index}")
        }
        return value
    }

    @Suppress("UNCHECKED_CAST")
    fun parseObject(json: String): Map<String, Any?> {
        val parsed = parse(json)
        return (parsed as? Map<String, Any?>)
            ?: throw IllegalArgumentException("Expected JSON object but got ${parsed?.javaClass?.simpleName ?: "null"}")
    }

    @Suppress("UNCHECKED_CAST")
    fun parseArray(json: String): List<Any?> {
        val parsed = parse(json)
        return (parsed as? List<Any?>)
            ?: throw IllegalArgumentException("Expected JSON array but got ${parsed?.javaClass?.simpleName ?: "null"}")
    }

    private fun parseValue(lexer: JsonLexer): Any? {
        lexer.skipWhitespace()
        return when (val ch = lexer.peek()) {
            '{' -> parseObject(lexer)
            '[' -> parseArray(lexer)
            '"' -> parseString(lexer)
            't', 'f' -> parseBoolean(lexer)
            'n' -> parseNull(lexer)
            '-', in '0'..'9' -> parseNumber(lexer)
            else -> throw IllegalArgumentException("Unexpected character '$ch' at position ${lexer.index}")
        }
    }

    private fun parseObject(lexer: JsonLexer): Map<String, Any?> {
        lexer.consume('{')
        val map = mutableMapOf<String, Any?>()
        lexer.skipWhitespace()
        if (lexer.peek() == '}') {
            lexer.consume('}')
            return map
        }

        while (true) {
            lexer.skipWhitespace()
            if (lexer.peek() != '"') {
                throw IllegalArgumentException("Expected string key at position ${lexer.index}")
            }
            val key = parseString(lexer)
            lexer.skipWhitespace()
            lexer.consume(':')
            val value = parseValue(lexer)
            map[key] = value

            lexer.skipWhitespace()
            when (val next = lexer.peek()) {
                ',' -> {
                    lexer.consume(',')
                    continue
                }
                '}' -> {
                    lexer.consume('}')
                    return map
                }
                else -> throw IllegalArgumentException("Expected ',' or '}' at position ${lexer.index}, found '$next'")
            }
        }
    }

    private fun parseArray(lexer: JsonLexer): List<Any?> {
        lexer.consume('[')
        val list = mutableListOf<Any?>()
        lexer.skipWhitespace()
        if (lexer.peek() == ']') {
            lexer.consume(']')
            return list
        }

        while (true) {
            list.add(parseValue(lexer))
            lexer.skipWhitespace()
            when (val next = lexer.peek()) {
                ',' -> {
                    lexer.consume(',')
                    continue
                }
                ']' -> {
                    lexer.consume(']')
                    return list
                }
                else -> throw IllegalArgumentException("Expected ',' or ']' at position ${lexer.index}, found '$next'")
            }
        }
    }

    private fun parseString(lexer: JsonLexer): String {
        lexer.consume('"')
        val sb = StringBuilder()
        while (lexer.hasMore()) {
            val ch = lexer.next()
            if (ch == '"') {
                return sb.toString()
            }
            if (ch == '\\') {
                if (!lexer.hasMore()) throw IllegalArgumentException("Unterminated escape at ${lexer.index}")
                when (val esc = lexer.next()) {
                    '"' -> sb.append('"')
                    '\\' -> sb.append('\\')
                    '/' -> sb.append('/')
                    'b' -> sb.append('\b')
                    'f' -> sb.append('\u000C')
                    'n' -> sb.append('\n')
                    'r' -> sb.append('\r')
                    't' -> sb.append('\t')
                    'u' -> {
                        val hex = lexer.nextString(4)
                        sb.append(hex.toInt(16).toChar())
                    }
                    else -> sb.append(esc)
                }
            } else {
                sb.append(ch)
            }
        }
        throw IllegalArgumentException("Unterminated string literal at ${lexer.index}")
    }

    private fun parseNumber(lexer: JsonLexer): Number {
        val start = lexer.index
        if (lexer.peek() == '-') lexer.next()
        while (lexer.hasMore() && lexer.peek() in '0'..'9') {
            lexer.next()
        }
        var isFloat = false
        if (lexer.hasMore() && lexer.peek() == '.') {
            isFloat = true
            lexer.next()
            while (lexer.hasMore() && lexer.peek() in '0'..'9') {
                lexer.next()
            }
        }
        if (lexer.hasMore() && (lexer.peek() == 'e' || lexer.peek() == 'E')) {
            isFloat = true
            lexer.next()
            if (lexer.hasMore() && (lexer.peek() == '+' || lexer.peek() == '-')) {
                lexer.next()
            }
            while (lexer.hasMore() && lexer.peek() in '0'..'9') {
                lexer.next()
            }
        }
        val numStr = lexer.substring(start, lexer.index)
        return if (isFloat) {
            numStr.toDouble()
        } else {
            val longVal = numStr.toLong()
            if (longVal in Int.MIN_VALUE..Int.MAX_VALUE) longVal.toInt() else longVal
        }
    }

    private fun parseBoolean(lexer: JsonLexer): Boolean {
        return if (lexer.peek() == 't') {
            lexer.expect("true")
            true
        } else {
            lexer.expect("false")
            false
        }
    }

    private fun parseNull(lexer: JsonLexer): Any? {
        lexer.expect("null")
        return null
    }

    fun toJson(value: Any?): String {
        val sb = StringBuilder()
        serialize(value, sb)
        return sb.toString()
    }

    @Suppress("UNCHECKED_CAST")
    private fun serialize(value: Any?, sb: StringBuilder) {
        when (value) {
            null -> sb.append("null")
            is Boolean -> sb.append(value)
            is Number -> sb.append(value)
            is CharSequence -> {
                sb.append('"')
                value.forEach { ch ->
                    when (ch) {
                        '"' -> sb.append("\\\"")
                        '\\' -> sb.append("\\\\")
                        '\b' -> sb.append("\\b")
                        '\u000C' -> sb.append("\\f")
                        '\n' -> sb.append("\\n")
                        '\r' -> sb.append("\\r")
                        '\t' -> sb.append("\\t")
                        else -> {
                            if (ch.code < 0x20) {
                                sb.append(String.format("\\u%04x", ch.code))
                            } else {
                                sb.append(ch)
                            }
                        }
                    }
                }
                sb.append('"')
            }
            is Map<*, *> -> {
                sb.append('{')
                var first = true
                for ((k, v) in value) {
                    if (!first) sb.append(',')
                    first = false
                    serialize(k.toString(), sb)
                    sb.append(':')
                    serialize(v, sb)
                }
                sb.append('}')
            }
            is Iterable<*> -> {
                sb.append('[')
                var first = true
                for (item in value) {
                    if (!first) sb.append(',')
                    first = false
                    serialize(item, sb)
                }
                sb.append(']')
            }
            is Array<*> -> serialize(value.toList(), sb)
            else -> serialize(value.toString(), sb)
        }
    }

    private class JsonLexer(private val src: String) {
        var index = 0

        fun hasMore(): Boolean = index < src.length

        fun peek(): Char {
            if (!hasMore()) throw IllegalArgumentException("Unexpected end of JSON input")
            return src[index]
        }

        fun next(): Char {
            val ch = peek()
            index++
            return ch
        }

        fun consume(expected: Char) {
            val actual = next()
            if (actual != expected) {
                throw IllegalArgumentException("Expected '$expected' but found '$actual' at position ${index - 1}")
            }
        }

        fun expect(expected: String) {
            for (ch in expected) {
                consume(ch)
            }
        }

        fun nextString(length: Int): String {
            if (index + length > src.length) throw IllegalArgumentException("Unexpected end of input reading $length characters")
            val s = src.substring(index, index + length)
            index += length
            return s
        }

        fun substring(start: Int, end: Int): String = src.substring(start, end)

        fun skipWhitespace() {
            while (hasMore()) {
                val c = src[index]
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                    index++
                } else {
                    break
                }
            }
        }
    }
}
