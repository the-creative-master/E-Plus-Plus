/*
 * E++ 1.2 — the built-in tutorials.
 *
 * Each course is a deck of cards. A card has:
 *
 *   goal      one sentence: what the finished program must do
 *   body      the teaching text, as blocks (see renderBlock in index.html)
 *   starter   the code that is waiting in the editor
 *   solution  a program that passes the card (used by the test-suite)
 *   hints     nudges, revealed one at a time
 *   check     how the card is marked (see check() below)
 *   needs     libraries the card uses, so a build without them can hide it
 *   test      optional inputs (keys, answers) used when the card is marked
 *
 * A card is passed by running the code the reader wrote and comparing what it
 * actually printed with what the card asked for. Nothing is marked "done"
 * because it looks right.
 *
 * tests/run-tests.mjs runs every solution through the engine and requires the
 * check to pass — and every starter to fail — so a tutorial cannot rot.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  // Kept from 1.2 on purpose: the card ids did not change, so upgrading
  // must not wipe the ticks someone already earned.
  var PROGRESS_KEY = 'epp_tutorial_progress_1_2';

  // ------------------------------------------------------------------
  // The courses
  // ------------------------------------------------------------------

  var COURSES = [
    {
      id: 'first-words',
      title: 'First words',
      icon: '🌱',
      blurb: 'Print things, do a little maths, and learn to read an error.',
      steps: [
        {
          id: 'say-hello',
          title: 'Make the computer talk',
          goal: 'Print exactly: Hello, World!',
          body: [
            { p: '`say` is how an E++ program speaks. Whatever follows it on the line is printed.' },
            { p: 'Text always goes inside **double quotes**, because double quotes are reserved for words. Variables use single quotes — you will meet those on the next card.' },
            { code: 'say "Hello, World!"' }
          ],
          starter: 'note [Write your first line under this note]\n',
          solution: 'say "Hello, World!"\n',
          hints: [
            'The line starts with the word say.',
            'Put the words inside double quotes: say "Hello, World!"'
          ],
          check: { output: ['Hello, World!'] }
        },
        {
          id: 'say-maths',
          title: 'Numbers do not need quotes',
          goal: 'Print `2` on the first line and `7` on the second.',
          body: [
            { p: 'Numbers are written **without** quotes, and E++ works them out before printing.' },
            { code: 'say 1 plus 1\nsay 3 plus 4' },
            { p: 'The words `plus`, `minus` and `times` are arithmetic. `say 1 plus 1` prints `2`, while `say "1 plus 1"` would print the words.' }
          ],
          starter: 'note [Print 2, then print 7]\n',
          solution: 'say 1 plus 1\nsay 3 plus 4\n',
          hints: [
            'One `say` per line, two lines in total.',
            '2 is `1 plus 1`. 7 is `3 plus 4`.'
          ],
          check: { output: ['2', '7'] }
        },
        {
          id: 'quotes-matter',
          title: 'Quotes change everything',
          goal: 'Print exactly: 2 plus 5',
          body: [
            { p: 'Those same three words behave differently inside quotes. With quotes they are text; without them they are a sum.' },
            { code: 'say 2 plus 5\nsay "2 plus 5"' },
            { p: 'The first line prints `7`. The second prints the words `2 plus 5`, because quotes turn maths back into text.' },
            { tip: 'This is the first of the three Golden Rules: no quotes for maths, double quotes for text.' }
          ],
          starter: 'note [Print the words 2 plus 5, not the answer]\n',
          solution: 'say "2 plus 5"\n',
          hints: [
            'You want the words, so they have to be inside double quotes.',
            'say "2 plus 5"'
          ],
          check: { output: ['2 plus 5'] }
        },
        {
          id: 'notes',
          title: 'Notes are for humans',
          goal: 'Print only: Done — and leave at least one note in the program.',
          body: [
            { p: 'A note is a comment. It is written with square brackets and it never prints.' },
            { code: 'note [This line explains the program]\nsay "Done"' }
          ],
          starter: 'note [Keep this note and print Done]\n',
          solution: 'note [This note never prints]\nsay "Done"\n',
          hints: [
            'Notes start with the word note and live inside square brackets.',
            'You still need a `say` line — notes on their own print nothing.'
          ],
          check: { output: ['Done'], notContains: ['note'] }
        },
        {
          id: 'fix-the-error',
          title: 'Read the error, fix the line',
          goal: 'Print exactly: Hello, Ada',
          body: [
            { p: 'This program is broken on purpose. Run it and read the message: E++ tells you which line it stopped on and what it wanted instead.' },
            { code: 'let "Name" be "Ada"\nsay "Hello, ", \'Name\'' },
            { p: 'The error is about the **name** of the variable, not the text. Text lives in double quotes; a variable name lives in single quotes.' },
            { tip: 'Every error E++ prints has three parts: the code (like E202), the reason, and a Help line that shows the shape it expects.' }
          ],
          starter: 'let "Name" be "Ada"\nsay "Hello, ", \'Name\'\n',
          solution: 'let \'Name\' be "Ada"\nsay "Hello, ", \'Name\'\n',
          hints: [
            'Look at `let "Name"`: the name of a variable is never in double quotes.',
            'Change the first line to: let \'Name\' be "Ada"'
          ],
          check: { output: ['Hello, Ada'] }
        }
      ]
    },

    {
      id: 'values',
      title: 'Values with names',
      icon: '🏷️',
      blurb: 'Remember things, change them, and ask the person using your program.',
      steps: [
        {
          id: 'let-a-value',
          title: 'Give a value a name',
          goal: 'Print exactly: Hello, Ada',
          body: [
            { p: 'A variable keeps a value under a name. The name is written in **single quotes**, and `let` puts a value into it.' },
            { code: 'let \'Name\' be "Ada"\nsay "Hello, ", \'Name\'' },
            { p: '`say` can take several pieces separated by commas, and prints them as one line.' }
          ],
          starter: 'note [Store Ada in a variable called Name, then greet her]\n',
          solution: 'let \'Name\' be "Ada"\nsay "Hello, ", \'Name\'\n',
          hints: [
            'Start with: let \'Name\' be "Ada"',
            'Then add: say "Hello, ", \'Name\''
          ],
          check: { output: ['Hello, Ada'] }
        },
        {
          id: 'change-a-value',
          title: 'Change what a name holds',
          goal: 'Print exactly: 15',
          body: [
            { p: 'Writing `let` again for the same name replaces the value. That is how a counter counts.' },
            { code: 'let \'Score\' be 10\nlet \'Score\' be \'Score\' plus 5\nsay \'Score\'' },
            { tip: 'The right-hand side is worked out first, using the old value, and then the name is updated.' }
          ],
          starter: 'let \'Score\' be 10\nnote [Add 5 to Score, then print it]\n',
          solution: 'let \'Score\' be 10\nlet \'Score\' be \'Score\' plus 5\nsay \'Score\'\n',
          hints: [
            'The new value is `\'Score\' plus 5`.',
            'let \'Score\' be \'Score\' plus 5'
          ],
          check: { output: ['15'] }
        },
        {
          id: 'ask-a-question',
          title: 'Ask a question',
          goal: 'Ask for a name, then print exactly: Hello, Sam!',
          body: [
            { p: '`ask` shows a question and stores the answer under a name.' },
            { code: 'ask "What is your name?" and save the output as \'Name\'\nsay "Hello, ", \'Name\', "!"' },
            { tip: 'This card answers the question with **Sam** for you, so the check is the same every time. In your own program the person at the keyboard types the answer.' }
          ],
          starter: 'note [Ask for a name and save it as Name, then greet the person]\n',
          solution: 'ask "What is your name?" and save the output as \'Name\'\nsay "Hello, ", \'Name\', "!"\n',
          test: { answers: ['Sam'] },
          hints: [
            'The shape is: ask "<question>" and save the output as \'Name\'',
            'Then say "Hello, ", \'Name\', "!"'
          ],
          check: { output: ['Hello, Sam!'] }
        },
        {
          id: 'build-a-sentence',
          title: 'Build a sentence',
          goal: 'Print exactly: Ada is 36 years old',
          body: [
            { p: 'Text, numbers and variables can be joined with commas into one line. A space is only added where two pieces would otherwise run together, so put the spaces you want inside the text.' },
            { code: 'let \'Name\' be "Ada"\nlet \'Age\' be 36\nsay \'Name\', " is ", \'Age\', " years old"' }
          ],
          starter: 'let \'Name\' be "Ada"\nlet \'Age\' be 36\nnote [Print: Ada is 36 years old]\n',
          solution: 'let \'Name\' be "Ada"\nlet \'Age\' be 36\nsay \'Name\', " is ", \'Age\', " years old"\n',
          hints: [
            'Four pieces: the name, " is ", the age, " years old".',
            'say \'Name\', " is ", \'Age\', " years old"'
          ],
          check: { output: ['Ada is 36 years old'] }
        }
      ]
    },

    {
      id: 'decisions',
      title: 'Decisions',
      icon: '🔀',
      blurb: 'Let the program choose: if, otherwise, and comparisons.',
      steps: [
        {
          id: 'if-then',
          title: 'If something is true',
          goal: 'Print exactly: That is a big number.',
          body: [
            { p: 'An `if` runs the rest of the line only when its condition is true.' },
            { code: 'let \'Score\' be 12\nif \'Score\' is greater than 10 then say "That is a big number."' },
            { p: 'The comparison words read like English: `is greater than`, `is less than`, `is equal to`.' }
          ],
          starter: 'let \'Score\' be 12\nnote [If Score is greater than 10, print: That is a big number.]\n',
          solution: 'let \'Score\' be 12\nif \'Score\' is greater than 10 then say "That is a big number."\n',
          hints: [
            'Start the line with: if \'Score\' is greater than 10 then',
            'Everything after `then` runs only when the test passes.'
          ],
          check: { output: ['That is a big number.'] }
        },
        {
          id: 'otherwise',
          title: 'And what if it is not?',
          goal: 'Print exactly: Child',
          body: [
            { p: '`otherwise` goes on the line straight after the `if`, and runs when the test failed.' },
            { code: 'let \'Age\' be 8\nif \'Age\' is greater than or equal to 12 then say "Adult"\notherwise say "Child"' }
          ],
          starter: 'let \'Age\' be 8\nnote [Print Adult when Age is 12 or more, otherwise print Child]\n',
          solution: 'let \'Age\' be 8\nif \'Age\' is greater than or equal to 12 then say "Adult"\notherwise say "Child"\n',
          hints: [
            'The test is `\'Age\' is greater than or equal to 12`.',
            'Put `otherwise say "Child"` on the very next line.'
          ],
          check: { output: ['Child'] }
        },
        {
          id: 'compare-text',
          title: 'Comparing words',
          goal: 'Print exactly: Go!',
          body: [
            { p: 'Comparisons work on text too. This is how a program reacts to a typed answer.' },
            { code: 'let \'Answer\' be "yes"\nif \'Answer\' is equal to "yes" then say "Go!"\notherwise say "Stop"' }
          ],
          starter: 'let \'Answer\' be "yes"\nnote [Print Go! when Answer is yes, otherwise print Stop]\n',
          solution: 'let \'Answer\' be "yes"\nif \'Answer\' is equal to "yes" then say "Go!"\notherwise say "Stop"\n',
          hints: [
            'Compare with `is equal to`.',
            'The text being compared goes in double quotes: "yes".'
          ],
          check: { output: ['Go!'] }
        },
        {
          id: 'block-if',
          title: 'When one line is not enough',
          goal: 'Print exactly two lines: Big! and Really big!',
          body: [
            { p: 'End the `if` line with a colon to run several lines, and close the block with `end if`.' },
            { code: 'let \'Size\' be 3\nif \'Size\' is greater than 2 then:\n    say "Big!"\n    say "Really big!"\nend if' }
          ],
          starter: 'let \'Size\' be 3\nnote [When Size is greater than 2, print Big! and then Really big!]\n',
          solution: 'let \'Size\' be 3\nif \'Size\' is greater than 2 then:\n    say "Big!"\n    say "Really big!"\nend if\n',
          hints: [
            'Indent the two `say` lines under the `if`.',
            'Close the block with `end if` on its own line.'
          ],
          check: { output: ['Big!', 'Really big!'] }
        }
      ]
    },

    {
      id: 'loops',
      title: 'Loops',
      icon: '🔁',
      blurb: 'Do something again, and again, without writing it twice.',
      steps: [
        {
          id: 'repeat-three',
          title: 'Repeat a fixed number of times',
          goal: 'Print Hello three times (three lines).',
          body: [
            { p: '`repeat N times` runs the indented lines N times, and `end repeat` closes the loop.' },
            { code: 'repeat 3 times\n    say "Hello"\nend repeat' }
          ],
          starter: 'note [Print Hello three times with a repeat loop]\n',
          solution: 'repeat 3 times\n    say "Hello"\nend repeat\n',
          hints: [
            'Start with: repeat 3 times',
            'Put `say "Hello"` on the next line, indented, then `end repeat`.'
          ],
          check: { output: ['Hello', 'Hello', 'Hello'] }
        },
        {
          id: 'count-with-while',
          title: 'Repeat until something changes',
          goal: 'Print 1, 2 and 3 — one number per line.',
          body: [
            { p: 'A `while` loop keeps going as long as its condition is true. Something inside the loop has to move the condition towards false, or the loop never ends.' },
            { code: 'let \'n\' be 1\nwhile \'n\' is less than 4 do\n    say \'n\'\n    let \'n\' be \'n\' plus 1\nend while' }
          ],
          starter: 'let \'n\' be 1\nnote [Print 1, 2, 3 with a while loop]\n',
          solution: 'let \'n\' be 1\nwhile \'n\' is less than 4 do\n    say \'n\'\n    let \'n\' be \'n\' plus 1\nend while\n',
          hints: [
            'The condition is `\'n\' is less than 4`.',
            'Do not forget `let \'n\' be \'n\' plus 1` inside the loop — without it the loop never stops.'
          ],
          check: { output: ['1', '2', '3'] }
        },
        {
          id: 'sum-1-to-5',
          title: 'Add up a run of numbers',
          goal: 'Print exactly: 15',
          body: [
            { p: 'Two variables and one loop are enough for most counting jobs: one to walk through the numbers, one to keep the total.' },
            { code: 'let \'n\' be 1\nlet \'Total\' be 0\nwhile \'n\' is less than 6 do\n    let \'Total\' be \'Total\' plus \'n\'\n    let \'n\' be \'n\' plus 1\nend while\nsay \'Total\'' }
          ],
          starter: 'let \'n\' be 1\nlet \'Total\' be 0\nnote [Add 1 to 5 into Total, then print Total]\n',
          solution: 'let \'n\' be 1\nlet \'Total\' be 0\nwhile \'n\' is less than 6 do\n    let \'Total\' be \'Total\' plus \'n\'\n    let \'n\' be \'n\' plus 1\nend while\nsay \'Total\'\n',
          hints: [
            'Inside the loop, add `\'n\'` to `\'Total\'` and then add 1 to `\'n\'`.',
            'Print `\'Total\'` after `end while`, not inside the loop.'
          ],
          check: { output: ['15'] }
        }
      ]
    },

    {
      id: 'libraries',
      title: 'Libraries',
      icon: '📚',
      blurb: 'Borrow abilities: square roots, percentages, word tools and dice.',
      steps: [
        {
          id: 'add-library',
          title: 'Add a library',
          goal: 'Print exactly: 12',
          body: [
            { p: 'Libraries are extra abilities. You ask for one with `add the "Math" library` and then its words become part of the language.' },
            { code: 'add the "Math" library\nsay the square root of 144' },
            { tip: 'Using a library word before adding the library gives a clear error, not a wrong answer.' }
          ],
          starter: 'note [Add the Math library, then print the square root of 144]\n',
          solution: 'add the "Math" library\nsay the square root of 144\n',
          hints: [
            'First line: add the "Math" library',
            'Second line: say the square root of 144'
          ],
          check: { output: ['12'] },
          needs: []
        },
        {
          id: 'percent-of',
          title: 'Percentages',
          goal: 'Print exactly: 30',
          body: [
            { p: 'The Math library understands percentages as words.' },
            { code: 'add the "Math" library\nsay 20 percent of 150' },
            { p: '20% of 150 is 30, and the program says so without any `* 0.2` in sight.' }
          ],
          starter: 'add the "Math" library\nnote [Print 20 percent of 150]\n',
          solution: 'add the "Math" library\nsay 20 percent of 150\n',
          hints: ['The phrase is `20 percent of 150`.'],
          check: { output: ['30'] }
        },
        {
          id: 'word-tools',
          title: 'Working with words',
          goal: 'Print `E++` and then `5`.',
          body: [
            { p: 'The Strings library can change the case of text and count its letters.' },
            { code: 'add the "Strings" library\nsay the uppercase of "e++"\nsay the length of "hello"' }
          ],
          starter: 'add the "Strings" library\nnote [Print the uppercase of "e++", then the length of "hello"]\n',
          solution: 'add the "Strings" library\nsay the uppercase of "e++"\nsay the length of "hello"\n',
          hints: [
            '`the uppercase of "e++"` gives `E++`.',
            '`the length of "hello"` gives `5`.'
          ],
          check: { output: ['E++', '5'] }
        },
        {
          id: 'roll-a-number',
          title: 'A little randomness',
          goal: 'Print one line that starts with `Rolling: ` and ends with a number from 1 to 6.',
          body: [
            { p: 'The Random library produces numbers you did not choose — the start of every game.' },
            { code: 'add the "Random" library\nsay "Rolling: ", random number between 1 and 6' },
            { p: 'Run it a few times: the code is the same, the answer is not.' }
          ],
          starter: 'add the "Random" library\nnote [Print "Rolling: " followed by a random number from 1 to 6]\n',
          solution: 'add the "Random" library\nsay "Rolling: ", random number between 1 and 6\n',
          hints: ['The phrase is `random number between 1 and 6`.'],
          check: { matches: [/^Rolling: [1-6]$/] }
        }
      ]
    },

    {
      id: 'keys-and-time',
      title: 'Keys and timing',
      icon: '⌨️',
      blurb: 'React to the keyboard and to time passing.',
      steps: [
        {
          id: 'arrow-keys',
          title: 'Is a key held down?',
          goal: 'While the Up arrow is held, print exactly: Up!',
          body: [
            { p: 'The Keyboard library can tell you whether a key is pressed right now. Key names are words: `"Up arrow"`, `"Space"`, `"a"`.' },
            { code: 'add the "Keyboard" library\nif the "Up arrow" key is pressed then say "Up!"' },
            { tip: 'This card holds the Up arrow down for you while it runs. In your own programs the person at the keyboard holds it down.' }
          ],
          starter: 'note [Add the Keyboard library, then print Up! while the Up arrow is held]\n',
          solution: 'add the "Keyboard" library\nif the "Up arrow" key is pressed then say "Up!"\n',
          test: { keys: { ArrowUp: true } },
          hints: [
            'First line: add the "Keyboard" library',
            'The test is `the "Up arrow" key is pressed`.'
          ],
          check: { output: ['Up!'] },
          needs: ['Keyboard']
        },
        {
          id: 'letter-keys',
          title: 'Letters, spaces and more',
          goal: 'While the letter a is held, print exactly: The a key is down.',
          body: [
            { p: 'Single letters are keys too, and so are `"Space"`, `"Enter"`, `"Escape"`, `"Shift"` and the rest.' },
            { code: 'add the "Keyboard" library\nif the "a" key is pressed then say "The a key is down."' }
          ],
          starter: 'add the "Keyboard" library\nnote [Print The a key is down. while the letter a is held]\n',
          solution: 'add the "Keyboard" library\nif the "a" key is pressed then say "The a key is down."\n',
          test: { keys: { a: true } },
          hints: ['The key name is just `"a"`.'],
          check: { output: ['The a key is down.'] },
          needs: ['Keyboard']
        },
        {
          id: 'a-pause',
          title: 'Let time pass',
          goal: 'Wait, then print exactly: Done',
          body: [
            { p: '`wait` pauses the program. Seconds can be fractional.' },
            { code: 'add the "{wait}" library\nwait 0.5 seconds\nsay "Done"' }
          ],
          starter: 'note [Wait half a second, then print Done]\n',
          solution: 'add the "{wait}" library\nwait 0.2 seconds\nsay "Done"\n',
          hints: ['`wait 0.2 seconds` is the pause.'],
          check: { output: ['Done'] },
          needs: ['{wait}']
        },
        {
          id: 'wait-until',
          title: 'Wait for a condition',
          goal: 'Print exactly: Ready',
          body: [
            { p: '{wait} can wait until something becomes true — and `at most` keeps it from waiting forever.' },
            { code: 'add the "{wait}" library\nlet \'Ready\' be 1\nwait at most 2 seconds until \'Ready\' is equal to 1\nsay "Ready"' },
            { p: 'This is how a program waits for a click, a key, or another part of the game to finish.' }
          ],
          starter: 'add the "{wait}" library\nlet \'Ready\' be 1\nnote [Wait at most 2 seconds until Ready is equal to 1, then print Ready]\n',
          solution: 'add the "{wait}" library\nlet \'Ready\' be 1\nwait at most 0.2 seconds until \'Ready\' is equal to 1\nsay "Ready"\n',
          hints: [
            'The phrase is `wait at most 0.2 seconds until \'Ready\' is equal to 1`.',
            'Then print Ready on the next line.'
          ],
          check: { output: ['Ready'] },
          needs: ['{wait}']
        }
      ]
    },

    {
      id: 'games',
      title: 'Games',
      icon: '🎮',
      blurb: 'A window, an actor with a picture, movement and collisions. Studio only.',
      needs: ['Game'],
      steps: [
        {
          id: 'open-window',
          title: 'Open a game window',
          goal: 'Set up a window and print exactly: Ready',
          body: [
            { p: 'The Game library gives you a window and a game loop. Start by choosing a size and a background colour.' },
            { code: 'add the "Game" library\nset the game window to 640 by 480\nset the game background to "night"\nsay "Ready"' }
          ],
          starter: 'add the "Game" library\nnote [Set the game window to 640 by 480, use the night background, then print Ready]\n',
          solution: 'add the "Game" library\nset the game window to 640 by 480\nset the game background to "night"\nsay "Ready"\n',
          hints: [
            'The lines start with `set the game window to ...` and `set the game background to ...`.',
            'Finish with `say "Ready"` so the card can see the program got there.'
          ],
          check: { output: ['Ready'] },
          needs: ['Game']
        },
        {
          id: 'create-actor',
          title: 'Put an actor on the stage',
          goal: 'Create an actor called hero and print exactly: Hero is on the stage.',
          body: [
            { p: 'An actor is a thing in the game: a picture with a name. The picture can be a file name or an image you added with the 🖼 Image button.' },
            { code: 'add the "Game" library\ncreate the actor \'hero\' with the image "hero.png"\nput the actor \'hero\' at 0 and 0\nsay "Hero is on the stage."' },
            { p: 'After that, the name `\'hero\'` behaves like a variable that holds the actor.' }
          ],
          starter: 'add the "Game" library\nnote [Create the actor hero with the image "hero.png", then say Hero is on the stage.]\n',
          solution: 'add the "Game" library\ncreate the actor \'hero\' with the image "hero.png"\nput the actor \'hero\' at 0 and 0\nsay "Hero is on the stage."\n',
          hints: [
            '`create the actor \'hero\' with the image "hero.png"`',
            '`put the actor \'hero\' at 0 and 0` puts it in the middle of the window.'
          ],
          check: { output: ['Hero is on the stage.'] },
          needs: ['Game']
        },
        {
          id: 'game-loop',
          title: 'The game loop',
          goal: 'Move the actor every frame, stop after a few frames, then print exactly: Game over',
          body: [
            { p: 'Everything between `play the game` and `end the game` runs once per frame — that is what makes things move.' },
            { code: 'add the "Game" library\ncreate the actor \'hero\' with the image "hero.png"\nlet \'Frames\' be 0\nplay the game\n    \'hero\' move right "2"\n    let \'Frames\' be \'Frames\' plus 1\n    if \'Frames\' is greater than 10 then stop the game\nend the game\nsay "Game over"' },
            { tip: 'Press the ⏹ Stop button on the game pane any time — or let the counter stop the loop, as this card does.' }
          ],
          starter: 'add the "Game" library\ncreate the actor \'hero\' with the image "hero.png"\nnote [Move the hero every frame, count the frames, and stop after 10]\n',
          solution: 'add the "Game" library\ncreate the actor \'hero\' with the image "hero.png"\nlet \'Frames\' be 0\nplay the game\n    \'hero\' move right "2"\n    let \'Frames\' be \'Frames\' plus 1\n    if \'Frames\' is greater than 10 then stop the game\nend the game\nsay "Game over"\n',
          hints: [
            'Inside the loop, move the actor and add 1 to `\'Frames\'`.',
            'Stop with `if \'Frames\' is greater than 10 then stop the game`.'
          ],
          check: { output: ['Game over'] },
          needs: ['Game']
        },
        {
          id: 'touching',
          title: 'When two actors meet',
          goal: 'Print exactly: Caught!',
          body: [
            { p: '`is touching` compares two actors. This is the whole idea behind catching, bumping and collecting.' },
            { code: 'add the "Game" library\ncreate the actor \'hero\' with the image "hero.png"\ncreate the actor \'gem\' with the image "gem.png"\nput the actor \'hero\' at 0 and 0\nput the actor \'gem\' at 0 and 0\nif \'hero\' is touching \'gem\' then say "Caught!"' }
          ],
          starter: 'add the "Game" library\ncreate the actor \'hero\' with the image "hero.png"\ncreate the actor \'gem\' with the image "gem.png"\nnote [Put both actors at 0 and 0, then print Caught! when they touch]\n',
          solution: 'add the "Game" library\ncreate the actor \'hero\' with the image "hero.png"\ncreate the actor \'gem\' with the image "gem.png"\nput the actor \'hero\' at 0 and 0\nput the actor \'gem\' at 0 and 0\nif \'hero\' is touching \'gem\' then say "Caught!"\n',
          hints: [
            'Put both actors in the same place with `put the actor ... at 0 and 0`.',
            'The test is `if \'hero\' is touching \'gem\' then ...`.'
          ],
          check: { output: ['Caught!'] },
          needs: ['Game']
        }
      ]
    }
  ];

  // ------------------------------------------------------------------
  // Marking
  // ------------------------------------------------------------------

  function lines(result) {
    return (result && result.output ? result.output : [])
      .map(function (line) { return String(line); })
      .filter(function (line, index, all) {
        // Ignore trailing blank lines, keep the ones in the middle.
        if (line.trim() !== '') return true;
        for (var i = index + 1; i < all.length; i++) if (all[i].trim() !== '') return true;
        return false;
      });
  }

  function describeLines(list) {
    if (!list.length) return '(nothing)';
    return list.map(function (line) { return '  ' + line; }).join('\n');
  }

  /**
   * Marks one card.
   *
   * result = { output: [...], error: <diagnostic or null> }
   * The step's check is a small object:
   *   output      exact lines, in order
   *   contains    every string must appear somewhere
   *   notContains no string may appear
   *   matches     every pattern must match at least one line
   */
  function check(step, result) {
    var spec = (step && step.check) || {};
    var out = lines(result);
    var text = out.join('\n');

    if (spec.error) {
      if (!result || !result.error) {
        return { ok: false, message: 'That was supposed to stop with an error, but it ran.' };
      }
      var errorText = String(result.error.message || result.error.reason || result.error);
      if (spec.error instanceof RegExp && !spec.error.test(errorText)) {
        return { ok: false, message: 'The program stopped, but not with the message this card expects.', detail: errorText };
      }
      return { ok: true };
    }

    if (result && result.error) {
      return {
        ok: false,
        message: 'Your program stopped before it finished.',
        detail: formatError(result.error)
      };
    }

    if (spec.output) {
      var wanted = spec.output.map(function (line) { return String(line); });
      var same = wanted.length === out.length && wanted.every(function (line, i) { return line === out[i]; });
      if (!same) {
        return {
          ok: false,
          message: 'Not quite — the program printed something else.',
          detail: 'Expected:\n' + describeLines(wanted) + '\n\nYour program printed:\n' + describeLines(out)
        };
      }
    }

    if (spec.contains) {
      for (var i = 0; i < spec.contains.length; i++) {
        if (text.indexOf(spec.contains[i]) === -1) {
          return {
            ok: false,
            message: 'The output is missing something: ' + spec.contains[i],
            detail: 'Your program printed:\n' + describeLines(out)
          };
        }
      }
    }

    if (spec.notContains) {
      for (var j = 0; j < spec.notContains.length; j++) {
        if (text.indexOf(spec.notContains[j]) !== -1) {
          return {
            ok: false,
            message: 'The output should not contain: ' + spec.notContains[j],
            detail: 'Your program printed:\n' + describeLines(out)
          };
        }
      }
    }

    if (spec.matches) {
      for (var k = 0; k < spec.matches.length; k++) {
        var pattern = spec.matches[k];
        var hit = out.some(function (line) {
          pattern.lastIndex = 0;
          return pattern.test(line);
        });
        if (!hit) {
          return {
            ok: false,
            message: 'The output does not look right yet.',
            detail: 'Expected a line like ' + pattern + '.\n\nYour program printed:\n' + describeLines(out)
          };
        }
      }
    }

    return { ok: true };
  }

  function formatError(error) {
    if (!error) return '';
    if (typeof error.format === 'function') return error.format();
    var code = error.code ? '[' + error.code + '] ' : '';
    return code + (error.reason || error.message || String(error));
  }

  // ------------------------------------------------------------------
  // Helpers used by the Studio and by the test-suite
  // ------------------------------------------------------------------

  /**
   * The waiting library a build ships. The Studio has the full ImprovedWait;
   * E++.zip only has ImprovedWaitLite. Cards that teach `wait` name
   * `{wait}` so the same card is right in both builds.
   */
  var WAIT_LIBRARIES = ['ImprovedWait', 'ImprovedWaitLite'];

  function waitLibraryFor(isAvailable) {
    if (typeof isAvailable !== 'function') return WAIT_LIBRARIES[0];
    for (var i = 0; i < WAIT_LIBRARIES.length; i += 1) {
      if (isAvailable(WAIT_LIBRARIES[i])) return WAIT_LIBRARIES[i];
    }
    return null;
  }

  /** Replaces {wait} (and any future {name}) in one string. */
  function fillPlaceholders(text, context) {
    if (typeof text !== 'string') return text;
    return text.replace(/\{(\w+)\}/g, function (whole, name) {
      var value = context && context[name];
      return value === undefined || value === null ? whole : value;
    });
  }

  /** A copy of a card with this build's library names filled in. */
  function resolveStep(step, context) {
    var resolved = {};
    Object.keys(step).forEach(function (key) {
      var value = step[key];
      if (typeof value === 'string') resolved[key] = fillPlaceholders(value, context);
      else if (Array.isArray(value)) {
        if (key === 'needs') {
          resolved[key] = value.map(function (name) { return fillPlaceholders(name, context); });
        } else {
          resolved[key] = value.map(function (item) {
            if (typeof item === 'string') return fillPlaceholders(item, context);
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              var copy = {};
              Object.keys(item).forEach(function (inner) {
                copy[inner] = typeof item[inner] === 'string' ? fillPlaceholders(item[inner], context) : item[inner];
              });
              return copy;
            }
            return item;
          });
        }
      } else resolved[key] = value;
    });
    return resolved;
  }

  function requirementsOf(course, step) {
    var needs = (course.needs || []).slice();
    (step.needs || []).forEach(function (name) {
      if (needs.indexOf(name) === -1) needs.push(name);
    });
    return needs;
  }

  /** Every course, but with cards this build cannot run taken out. */
  function forBuild(isAvailable) {
    if (typeof isAvailable !== 'function') return COURSES;
    var context = { wait: waitLibraryFor(isAvailable) };
    var kept = [];
    COURSES.forEach(function (course) {
      var steps = course.steps
        .map(function (step) { return resolveStep(step, context); })
        .filter(function (step) {
          return requirementsOf(course, step).every(function (name) {
            return name && isAvailable(name);
          });
        });
      if (!steps.length) return;
      kept.push({
        id: course.id,
        title: course.title,
        icon: course.icon,
        blurb: fillPlaceholders(course.blurb, context),
        hiddenSteps: course.steps.length - steps.length,
        steps: steps
      });
    });
    return kept;
  }

  function totalSteps(courses) {
    return (courses || COURSES).reduce(function (sum, course) { return sum + course.steps.length; }, 0);
  }

  function findStep(courseId, stepId) {
    for (var i = 0; i < COURSES.length; i++) {
      if (COURSES[i].id !== courseId) continue;
      for (var j = 0; j < COURSES[i].steps.length; j++) {
        if (COURSES[i].steps[j].id === stepId) return COURSES[i].steps[j];
      }
    }
    return null;
  }

  var Tutorials = {
    courses: COURSES,
    progressKey: PROGRESS_KEY,
    check: check,
    forBuild: forBuild,
    totalSteps: totalSteps,
    findStep: findStep,
    requirementsOf: requirementsOf,
    waitLibraryFor: waitLibraryFor,
    fillPlaceholders: fillPlaceholders,
    formatError: formatError
  };

  EPP.Tutorials = Tutorials;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Tutorials: Tutorials };
  }
})(typeof window !== 'undefined' ? window : globalThis);
