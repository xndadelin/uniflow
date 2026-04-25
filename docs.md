Aplicație web pentru gestionarea resurselor digitale dintr-o universitate

Trăim într-o perioadă în care inteligența artificială devine un partener în procesul
de învățare. În vederea pregătirii adecvate a studenților pentru acomodarea noilor
standarde din domeniul tehnologic, universitățile au încheiat parteneriate cu diverși
furnizori de resurse digitale (Exemplu: OpenAI, AWS).
Vă propunem lansarea unei platforme unice care să permită gestionarea
resurselor digitale în cadrul universității doar de către utilizatori autorizați (roluri:
administrator, profesor, student, audit). Ați fost desemnați să faceți parte din echipa de
dezvoltare însărcinată cu implementarea acestui proiect care, odată realizat, va avea un
impact uriaș pentru universitățile care doresc să țină pasul cu avansul rapid al dezvoltării
tehnologice.
Resursele digitale pe care le gestionează aplicația sunt:
 token-uri pentru agenți AI;
 abonamente pentru utilizarea de resurse hardware virtualizate (Exemplu:
Virtual Private Servers – VPSs).
În cadrul aplicației, utilizarea acestor resurse este simulată, studenții având
posibilitatea de a înregistra manual consumul acestora pentru diferite activități.
În urma unor analize amănunțite, s-a stabilit că soluția ce urmează a fi
implementată trebuie să asigure următoarele funcționalități tehnice:
 O pagină dedicată înregistrării/autentificării în aplicație, care să permită
crearea de conturi și autentificarea pe bază de roluri.
 Hashing parole;
 Mecanism de resetare a parolei;
 Fiecare rol să vizualizeze doar paginile la care are acces.
 O pagină destinată gestionării rolurilor de către administratorul universității,
unde acesta poate atribui, modifica sau revoca rolurile utilizatorilor existenți.
Pagina dedicată administratorului universității trebuie să cuprindă statisticile
pentru resursele folosite de către toți utilizatorii (folosite de un student, folosite
la nivel de curs, folosite la nivel de universitate); fiecare statistică va cuprinde
următoarele elemente:
 Număr de token-uri alocate;
 Numărul de token-uri folosite pentru fiecare activitate;
 Număr total de token-uri folosite;
 Număr de abonamente alocate;
 Număr de abonamente utilizate.

 O pagină dedicată profesorilor, unde pot crea cursuri; la crearea cursurilor,
aceștia menționează numărul și tipul de resurse digitale necesare, precum și
numărul maxim de studenți; fiecare profesor primește în momentul alocării
resurselor de către administrator, un suplimentar de 10% din totalul resurselor
necesare cursului (disponibil pentru distribuire la solicitarea studenților).
 Administratorul trebuie să introducă numărul total de resursele digitale de care
urmează să dispună universitatea (administratorul stabilește numărul total de
resurse disponibile pe baza numărului de resurse introduse de profesori și
număr de studenți per curs și va cuprinde și un număr suplimentar de resurse
– cel puțin 10% extra);
 Administratorul efectuează distribuția resurselor per cursuri și studenți în
funcție de necesitățile introduse de profesori.
 Administratorul introduce tipurile de activități prin care pot fi consumate token-
urile (minim 10 activități) și numărul de token-uri per activitate. Exemplu de
interacțiuni cu un agent AI:
 rezumat text – 10 token-uri;
 generare imagine – 50 token-uri;
 asistență la dezvoltare aplicații software – 5000 token-uri;
 O pagină principală unde studenții:
 pot vizualiza cursurile la care sunt înrolați;
 se pot înrola la cursurile unde mai sunt locuri disponibile;
 O pagină dedicată fiecărui curs unde:
 se pot vizualiza materialele încărcate de profesor;
 se afișează resursele digitale disponibile pe care le mai are studentul
de folosit;
 studenții pot încărca temele realizate (fișiere .pdf, .txt, etc);
 studenții pot consuma resursele de tip token selectând activitățile
desfășurate; Exemplu:
 10 activități de generare imagine;
 1 activitate de asistență la dezvoltare aplicații software;
 pentru cursurile care dispun de resurse de tip abonament, la momentul
distribuirii resurselor, studenții primesc via email credențialele și IP-ul
VPS-ului. pentru a simula validarea utilizării abonamentelor se va folosi
API-ul public disponibil la https://httpbin.org, către care se vor trimite
credențialele; validarea efectivă se realizează cu răspunsul returnat de
API.
 studenții pot solicita resurse suplimentare cu aprobarea profesorului;
 dacă resursele suplimentare solicitate de student depășesc
suplimentarul profesorului (10% din totalul cursului), atunci profesorul
înaintează fluxul de aprobare către administrator.

 Fiecare acțiune a utilizatorilor trebuie să fie auditată.