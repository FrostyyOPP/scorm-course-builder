# Sample Course Title
> A one-line subtitle describing the course (optional).

## Module 1 — First module title
- video: lesson1-intro.mp4 | Welcome and Overview
- reading: lesson1-notes.docx | Background Reading
- quiz: graded-quiz.docx | Graded Quiz

<!--
OUTLINE FORMAT — this file is the master structure the builder reads.
  # <Course title>
  > <optional one-line subtitle>
  ## <Module / section title>          (each "##" starts a new module)
  - <type>: <filename> | <optional on-screen title>
       type     = video | reading | quiz
       filename = the file's name inside the matching folder:
                  video -> videos/    reading -> readings/    quiz -> quizzes/
Order top-to-bottom is the order learners experience it.

To try it: drop matching files into videos/ readings/ quizzes/, then run
  node src/index.js example-project
-->
