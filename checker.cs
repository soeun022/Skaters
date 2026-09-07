using System;
using System.IO;
using System.Collections.Generic;

class Program {
    static void Main() {
        string text = File.ReadAllText("app.js");
        int b = 0, p = 0;
        bool inStr = false, inStr2 = false, inStr3 = false;
        bool inLineComment = false, inBlockComment = false;
        char prev = '\0';
        
        for (int i = 0; i < text.Length; i++) {
            char c = text[i];
            char next = i + 1 < text.Length ? text[i+1] : '\0';
            
            if (inLineComment) {
                if (c == '\n') inLineComment = false;
            } else if (inBlockComment) {
                if (prev == '*' && c == '/') inBlockComment = false;
            } else if (inStr) {
                if (c == '\'' && prev != '\\') inStr = false;
            } else if (inStr2) {
                if (c == '"' && prev != '\\') inStr2 = false;
            } else if (inStr3) {
                if (c == '' && prev != '\\') inStr3 = false;
                else if (c == '$' && next == '{') {
                    // Template literal interpolation. We just count it as normal code.
                }
            } else {
                if (c == '/' && next == '/') { inLineComment = true; i++; }
                else if (c == '/' && next == '*') { inBlockComment = true; i++; }
                else if (c == '\'') { inStr = true; }
                else if (c == '"') { inStr2 = true; }
                else if (c == '') { inStr3 = true; }
                else if (c == '{') b++;
                else if (c == '}') b--;
                else if (c == '(') p++;
                else if (c == ')') p--;
            }
            if (c != '\\' || prev == '\\') prev = c;
            else prev = '\0'; // Handle escaping of escape char
        }
        Console.WriteLine($"Final -> Braces: {b}, Parens: {p}");
    }
}
