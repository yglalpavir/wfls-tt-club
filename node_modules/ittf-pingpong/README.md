# ITTF API


![Version](https://img.shields.io/npm/v/ittf-pingpong)
![Downloads](https://img.shields.io/npm/d18m/ittf-pingpong)
![Build](https://img.shields.io/github/actions/workflow/status/OctRomOsc/ITTF-PingPong/cicd.yml)
![Tests](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/OctRomOsc/79314e39815ea51372e01cb8eeafe6f9/raw/json-report.json)
![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/OctRomOsc/79314e39815ea51372e01cb8eeafe6f9/raw/coverage-summary.json)

Unofficial API written in TypeScript to retrieve player rankings and statistics from ITTF (International Table Tennis Federation) affiliated members and events. Provides methods to fetch player rankings with input validation and error handling.

---

## Features

- Fetch current rankings broken down by gender (Man, Woman, Mixed for doubles), by type (Youth, aggregate of U15, U18, and U21 & Senior), and by category (Singles, Doubles Pair rankings, Doubles Individual rankings)
- Look up a player's ITTF ID by searching with their Given Name, Family Name, or Full Name
- Look up a player's Profile by searching with their Full Name or their ITTF ID    
- Throw descriptive errors for invalid inputs  
- Facilitates the ingestion of ITTF data, making it easy to download full datasets to .csv files  

---

## Installation

```bash
npm install ittf-pingpong
# or using yarn
yarn add ittf-pingpong
# or using pnpm
pnpm add ittf-pingpong
```
---

## Usage
- TypeScript:
```typescript
import { ittfPingPong } from 'ittf-pingpong';

const client = new ittfPingPong();

async function fetchRankings() {
  try {
    const rankings : Rankings = await client.currentRankings('SEN', 'M', 'S', 10); //Returns top 10 Singles Senior Men
    const findId : PlayerId[] = await client.playerIttfId({playerFullName:"FAN Zhendong"}) //Returns single object Array of PlayerId
    const IdNum : number = Number(findId[0].IttfId)
    const profile : Stats = await client.playerProfile({playerIttfId:IdNum}) //Returns Win/Loss per year, top rank, etc.
    return [rankings, findId, profile];
  } catch (error : unknown) {
    console.error('Error fetching rankings:', error);
  }
}

fetchRankings();
```
- EcmaScriptModule :
```js
import { ittfPingPong } from 'ittf-pingpong';

const client = new ittfPingPong();

async function fetchRankings() {
  try {
    const rankings = await client.currentRankings('SEN', 'M', 'S', 210); //Returns top 10 Singles Senior Men
    const findId = await client.playerIttfId({playerFullName:"FAN Zhendong"}) //Returns 121404
    const IdNum = Number(findId[0].IttfId)
    const profile = await client.playerProfile({playerIttfId:IdNum}, {includeExtendedDetails: true}) //Returns Win/Loss per year, top rank, etc.
    return [rankings, findId, profile];
  } catch (error) {
    console.error('Error fetching rankings:', message);
  }
}

fetchRankings();
```
- CommonJS :

```js
async function fetchRankings() {
  try {
    const {ittfPingPong} = require("ittf-pingpong")
    const client = new ittfPingPong();
    const rankings = await client.currentRankings('SEN', 'M', 'S', 210); //Returns top 10 Singles Senior Men
    const findId = await client.playerIttfId({playerFullName:"FAN Zhendong"}) //Returns 121404
    const IdNum = Number(findId[0].IttfId)
    const profile = await client.playerProfile({playerIttfId:IdNum}, {includeExtendedDetails: true}) //Returns Win/Loss per year, top rank, etc.
    return [rankings, findId, profile];
  } catch (error) {
    console.error('Error fetching rankings:', error);
  }
}

fetchRankings();
```  
---

## API Methods

### currentRankings

Fetches current player rankings based on specified filters.

- Parameters:
```typescript
async currentRankings(
  type : 'YOU' | 'SEN',             // Competition type: Youth ('YOU') or Senior ('SEN')
  gender : 'M' | 'W' | 'X',         // Gender: Male ('M'), Female ('W'), Mixed ('X')
  category : 'S' | 'D' | 'DI',      // Category: Singles ('S'), Doubles ('D'), Doubles Individual ('DI')
  topN : number | 'all' = 100,            // Number of top players to fetch, or 'all'
  requestDelay : number = 2000
): Promise<Rankings>
```

- Returns:
    * Promise resolving to a Rankings array, containing objects of type RankEntry.

- Errors:
    * Throws an error if inputs are invalid, e.g., 'Invalid gender: V. Valid options are: M, W, X'
    * Throws an error if X gender is used with invalid category (e.g., 'S')

### playerIttfId

Fetches player's ITTF ID by searching their Full Name, Given Name, or Family Name. (Returns array of players if they share a common Given Name or Family Name).

- Parameters:
```typescript
async playerIttfId(
  searchName : FullName | GivenName | FamilyName //Family Name in all caps, followed by Given Name with first leter capitalized | playerGivenName | playerFamilyName
): Promise<Array<PlayerId>>
```

- Returns:
    * Promise resolving to an array of objects of type PlayerID.

- Errors:
    * Throws an error if inputs are invalid.
    * Throws an error if multiple search parameters are inputted.

### playerProfile

Fetches player's Profile by searching their Full Name or ITTF ID.

- Parameters:
```typescript
async playerProfile(
  searchMethod : PlayerFullName | IttfId, //Family Name in all caps, followed by Given Name with first letter capitalized | playerIttfId
  options : ProfileOptions = {includeExtendedDetails : false}
): Promise<Stats>
```

- Returns:
    * Promise resolving to a Stats object.

- Errors:
    * Throws an error if inputs are invalid.
    * Throws an error if multiple search parameters are inputted.