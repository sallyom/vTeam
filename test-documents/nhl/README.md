# NHL Test Documents for RAG Database

This directory contains comprehensive documentation about the National Hockey League (NHL) and its teams, designed to test the RAG (Retrieval-Augmented Generation) functionality in vTeam.

## Document Collection Overview

### Team Histories (Original Six)
- `montreal-canadiens-history.md` - History of the NHL's most successful franchise (24 Stanley Cups)
- `toronto-maple-leafs-history.md` - Canada's most valuable franchise and their 56-year drought
- `boston-bruins-history.md` - The Big Bad Bruins and their physical legacy
- `new-york-rangers-history.md` - Broadway Blueshirts and the 1994 miracle
- `detroit-red-wings-history.md` - Hockeytown's dynasty and 25-year playoff streak
- `chicago-blackhawks-history.md` - From Dollar Bill to modern dynasty

### Modern Dynasty Teams
- `edmonton-oilers-history.md` - Gretzky's Oilers and the 1980s dynasty
- `pittsburgh-penguins-history.md` - Lemieux and Crosby's championship teams
- `tampa-bay-lightning-history.md` - Modern success in a non-traditional market
- `vegas-golden-knights-history.md` - The most successful expansion team ever
- `colorado-avalanche-history.md` - From Quebec to Colorado, instant success

### League Overview Documents
- `original-six-overview.md` - The foundation era of professional hockey
- `nhl-overview.md` - Current league structure, rules, and operations
- `stanley-cup-history.md` - Complete history of hockey's ultimate prize
- `nhl-records-and-statistics.md` - All-time records and statistical achievements
- `nhl-playoff-format.md` - Current playoff structure and historical formats

## Test Scenarios

These documents enable testing of various RAG query scenarios:

### Factual Queries
- "How many Stanley Cups have the Montreal Canadiens won?"
- "Who holds the NHL record for most goals in a season?"
- "When was the NHL founded?"

### Comparative Queries
- "Which team has won more Stanley Cups: Toronto or Montreal?"
- "Compare Wayne Gretzky's and Mario Lemieux's careers"
- "What's the difference between the Original Six era and modern NHL?"

### Historical Queries
- "Tell me about the Edmonton Oilers dynasty of the 1980s"
- "What happened in the 1967 NHL expansion?"
- "Describe the Detroit-Colorado rivalry"

### Current Information Queries
- "How many teams are currently in the NHL?"
- "Explain the current playoff format"
- "Which teams are in the Atlantic Division?"

### Complex Multi-Document Queries
- "Which players have won the most Stanley Cups and with which teams?"
- "How has NHL expansion affected the Original Six teams?"
- "Trace the history of Canadian teams winning the Stanley Cup"

## Document Statistics
- **Total Documents**: 16
- **Total Content**: ~50,000 words
- **Topics Covered**: Team histories, league structure, records, championships
- **Time Period**: 1909-2024

## Usage with RAG System

These documents are designed to:
1. Test document ingestion and chunking
2. Evaluate semantic search accuracy
3. Validate citation generation
4. Assess multi-document retrieval
5. Test handling of numerical data and statistics

## Future Additions

Potential expansions could include:
- Player biographies
- Season-by-season summaries
- International hockey (Olympics, World Championships)
- Minor league systems (AHL, ECHL)
- Hockey Hall of Fame inductees
- Rule changes and evolution