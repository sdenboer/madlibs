import { Component } from '@angular/core';
import { StoreService } from '../service/localStore.services';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { ApiService } from '../service/api.services';
import { WaitingDialog } from './waitingdialog.component';
import { MatDialog } from '@angular/material/dialog';
import { TimerService } from '../service/timer.services';
import { throwToolbarMixedModesError } from '@angular/material/toolbar';

export interface MadLibDataObject {
  key: string,
  category: string,
  word1: string,
  word1color: string,
  word2: string,
  word2color: string,
  word3: string,
  word3color: string,
  word4: string,
  word4color: string
}

/*
  Component to contain the game functionality.
*/
@Component({
  selector: 'game',
  templateUrl: '../view/game.component.html'
})
export class GameComponent {
  // Local properties for display.
  gameData : any;
  gameDataKeys : any[] = [];
  
  madLibData : MadLibDataObject[] = [];
  madLibChoices : any = {};
  madLibSentence : string = "";

  submitted : boolean = false;

  shuffleModeOn : boolean = false;
  shuffleColor : string = "accent";

  endButtonText: string = "";
  footer_message: string = "";

  // Constructor
  constructor(
    private api : ApiService,
    public waitingDialog : MatDialog,
    private store : StoreService,
    protected timer : TimerService,
    private router : Router,
    private snackBar: MatSnackBar
  ) {
    // Grab data from the form.
    this.gameData = store.getGameState();

    // For quick testing, if left empty, fill with junk values.
    if (this.gameData == undefined) {
      this.quit();
    }
  }

  // Event: onInit append. Do last minute updates to UI elements, store what is needed and display.
  async ngOnInit() {
    // Load final text values.
    this.endButtonText = this.generateButtonText();
    this.footer_message = this.store.MAD_LIBS_FOOTER;

    // Update the player list.
    this.convertGameJSONtoUIObjects();

    // Get the current Mad lib and store it.
    let sessionID = this.gameData.sessieid;
    try {
      // Get the current Mad Lib from the server.
      await this.api.post({
        sessieid: sessionID,
        request: "mad lib"
      }, "madlib").then((result) => {
        this.store.setGameMadLib(result);
      });
    } catch(exception) {
      let snackBarRef = this.snackBar.open("" + exception, 'Sorry', { duration: 5000 });
    }
    this.convertMadLibJSONtoUIObjects(this.store.getGameMadLib());

    // Start the clock.
    this.store.setTimeLimit(this.store.getGameState().sessieTimer);
    this.timer.setClock(this.store.getTimeLimit());
    this.timer.timerCountdown();
    this.timer.timerDone.subscribe(() => {
      if (!this.submitted) {
        if (this.answersAllGiven()) {
          this.submitMadLib();
        } else {
          let allCategories: any[] = []
          for (let index = 0; index < this.madLibData.length; index ++) {
            allCategories.push({
              key: this.madLibData[index].key,
              category: this.madLibData[index].category,
              mldi: index
            });
          }
          for (let index = 0; index < allCategories.length; index ++) {
            let result = this.madLibChoices[allCategories[index].category];
            if (result !== undefined) {
              let iResult = result.find((key: any) => {
                return key.category == allCategories[index].key;
              });
              if (iResult !== undefined) {
                allCategories.splice(index, 1);
                index--;
              }
            }
          };
          
          allCategories.forEach((categoryKey) => {
             let randomNumber = Math.ceil(Math.random() * 4);
            switch(randomNumber){
              case 1:
                this.addChoice(
                  this.madLibData[categoryKey.mldi], 
                  categoryKey.key,
                  this.madLibData[categoryKey.mldi].word1
                );
              break;
              case 2:
                this.addChoice(
                  this.madLibData[categoryKey.mldi], 
                  categoryKey.key,
                  this.madLibData[categoryKey.mldi].word2
                );
              break;
              case 3:
                this.addChoice(
                  this.madLibData[categoryKey.mldi], 
                  categoryKey.key,
                  this.madLibData[categoryKey.mldi].word3
                );
              break;
              case 4:
                this.addChoice(
                  this.madLibData[categoryKey.mldi], 
                  categoryKey.key,
                  this.madLibData[categoryKey.mldi].word4
                );
              break;
              default:
                // This is literally unreachable.
              break;
            }
          });
  
          this.submitMadLib(false);
        }
      }
    });
  }

  // Add a choice to prevent code redundancy
  addChoice(categoryObject: MadLibDataObject, category: string, word: string) {
    if (this.madLibChoices[categoryObject.category] !== undefined) {
      
      // A response for this category was already stated. Add to array.
      // Check if the sent in version was already logged, or if it's a second answer.
      let previousAnswer = this.madLibChoices[categoryObject.category].filter((descriptor: any) => {
        return descriptor.category == category;
      });
      if (previousAnswer.length == 0) {
        if (word.trim() !== '') {
          this.madLibChoices[categoryObject.category].push({
            word: word,
            category: category
          });
        }
      } else {
        if (word.trim() == '') {
          let removalIndex = -1;
          for (let index = 0; index < this.madLibChoices[categoryObject.category].length; index++) {
            if (this.madLibChoices[categoryObject.category][index].category == category) {
              removalIndex = index;
              continue;
            }
          }
          this.madLibChoices[categoryObject.category].splice(removalIndex, 1);
        } else {
          previousAnswer[0].word = word;
        }
      }
    } else {
      // No response has been logged for this yet. Add it.
      this.madLibChoices[categoryObject.category] = [
        {
          word: word,
          category: category
        }
      ];
    }
  }

  // See if all answers were given
  answersAllGiven(): boolean {
    // Get all the parts to be replaced.
    let substitute_words = this.madLibSentence.split('$');

    // Count the amount of answers given.
    let madLibChoicesTrueLength = 0;
    Object.keys(this.madLibChoices).forEach((internalArray: any) => {
      madLibChoicesTrueLength += this.madLibChoices[internalArray].length;
    });

    return (substitute_words.length-1 == madLibChoicesTrueLength);
  }

  // Convert the current game state json into a player list useable by the html.
  convertGameJSONtoUIObjects() {
    let gameDataTemp = Object.keys(this.gameData).filter(prop => {
      return prop !== "sessieid" 
        && prop.indexOf("score") < 0 
        && prop.indexOf("_id") < 0
        && prop !== "sessieTimer"
    });
    
    gameDataTemp.forEach(item => {
      let name = item.indexOf("_name") > 0 
        ? item.substring(0, item.length-5).concat("_name") 
        : item;
      let score = item.indexOf("_name") > 0
        ? item.substring(0, item.length-5).concat("_score")
        : item.concat("_score");
      let id = item.indexOf("_name") > 0
        ? item.substring(0, item.length-5).concat("_id")
        : item.concat("_id");
      
      if (this.gameData[item] !== '') {
        this.gameDataKeys.push(
          { 
            "name": name,
            "score": score,
            "id": id
          });
      }
    });

    this.store.setPlayerId(this.gameData[this.gameDataKeys[this.gameDataKeys.length-1].id]);
  }

  // Convert the original Mad Lib json into a word list useable by the html.
  convertMadLibJSONtoUIObjects(convMadLibData : any) {
    this.madLibSentence = convMadLibData.madlib;
    
    let madLibDataTemp = convMadLibData.categories;
        
    madLibDataTemp.forEach((category : any) => {
      let categoryName = category.type;
      
      category.words.forEach((option : any) => {
        this.madLibData.push({
          key: categoryName + ' ' + option.id,
          category: categoryName.toUpperCase(),
          word1: option.word_1,
          word1color: "",
          word2: option.word_2,
          word2color: "",
          word3: option.word_3,
          word3color: "",
          word4: option.word_4,
          word4color: ""
        });
      });
    });
  }

  // Generate a random string to put on the confirm button.
  generateButtonText() : string {
    let endButtonTexts = [];
    endButtonTexts.push( "Create your Mad Lib!" );
    endButtonTexts.push( "For pony!" );
    endButtonTexts.push( "Push it. Push it real good!" );
    endButtonTexts.push( "Today is a good day!" );
    endButtonTexts.push( "For glory!" );
    endButtonTexts.push( "Press it. You know you want to." );

    let randomNumber = Math.floor( Math.random() * endButtonTexts.length );

    return endButtonTexts[randomNumber];
  }

  /*
    This class will change bindings of a category worth of buttons, either coloring one of the buttons
    or uncoloring all of the buttons.
  */
  highlightButton(context: MadLibDataObject, button: number) {
    context.word1color = '';
    context.word2color = '';
    context.word3color = '';
    context.word4color = '';

    switch (button) {
      case 1:
        context.word1color = 'warn';
      break;
      case 2:
        context.word2color = 'warn';
      break;
      case 3:
        context.word3color = 'warn';
      break;
      case 4:
        context.word4color = 'warn';
      break;
      default:
        // Do nothing, leave all buttons uncolored.
      break;
    }
  }
  
  // Return the user to the main screen.
  quit() {
    this.router.navigate([ '' ]);
  }

  // When a word button is clicked, execute the following code.
  onWordClicked(category: string, word: string) {
    let categoryObject = this.madLibData.filter((item) => {
      return item.key == category;
    })[0];
    let categoryWord = Object.keys(categoryObject).filter((itemKey) => {
      switch (itemKey) {
        case "word1":
          return categoryObject.word1 == word;
        case "word2":
          return categoryObject.word2 == word;
        case "word3":
          return categoryObject.word3 == word;
        case "word4":
          return categoryObject.word4 == word;
        default:
          return false;
      }
    })[0];
    
    // Use the highlighter to show pretty buttons.
    if (categoryWord == undefined) {
      // No matching word was found. Unhighlight all buttons.
      this.highlightButton(
        categoryObject,
        0
      );
    } else {
      // A matching word was found. Highlight that buttons.
      this.highlightButton(
        categoryObject, 
        parseInt(categoryWord.substring(categoryWord.length-1, categoryWord.length))
      );
    }

    // Save the response to the result matrix.
    this.addChoice(categoryObject, category, word);
  }

  // Request four new words for a category.
  async refreshCategory(categoryName : string) {
    if (this.shuffleModeOn) {
      let categoryType = categoryName.substring(0, categoryName.indexOf(' '));
      let newWords = {
        id: 0,
        word_1: "",
        word_2: "",
        word_3: "",
        word_4: ""
      };

      // API call goes here to get new values.
      try {
        // Request the voting state.
        await this.api.post({
          sessieid: this.gameData.sessieid,
          playerid: this.store.getPlayerId(),
          category: categoryType,
          score: 0
        }, "shuffle").then((result: any) => {
          newWords = result;
        });
      } catch(exception) {
        let snackBarRef = this.snackBar.open("" + exception, 'Sorry', { duration: 5000 });
      }
      
      // Get the current context for the item we want to change.
      let context = this.madLibData.filter((item) => {
        return item.key == categoryName;
      })[0];
      // Reset all color for category
      context.word1color = "";
      context.word2color = "";
      context.word3color = "";
      context.word4color = "";
      // Set the words to what was retrieved.
      context.word1 = newWords.word_1;
      context.word2 = newWords.word_2;
      context.word3 = newWords.word_3;
      context.word4 = newWords.word_4;
    }
  }

  // 'Shuffle' functionality. Refresh the words to use different words. 
  refreshWords() {
    this.shuffleModeOn = !this.shuffleModeOn;
    if (this.shuffleColor == "accent") {
      this.shuffleColor = "warn";
    } else {
      this.shuffleColor = "accent";
    }
  }

  // 'Report' functionality. Report words and make them go away.
  reportWords() {
    // TODO: WRITE REPORT FUNCTIONALITY
    let snackBarRef = this.snackBar.open("Exception: NYI", 'Okay', { duration: 5000 });
  }

  // Create and submit the finished Mad Lib.
  async submitMadLib(voteable: boolean = true) {
    // If the amount of answers given does not equal one less than the parts to be replaced,
    // show a snackbar. Otherwise, substitute for category words in mad lib.
    if (!this.answersAllGiven()) {
      let snackBarRef = this.snackBar.open("You need to select/write a word for every category before submitting!", 'Oops!', { duration: 3000 });
    } else {
      this.submitted = true;
      // Get all the parts to be replaced.
      let substitute_words = this.madLibSentence.split('$');
      let finishedMadLib = "";
      substitute_words.forEach((partial) => {
        let firstWord = partial.substring(0, partial.indexOf(' '));
        if (firstWord == '') {
          firstWord = partial.substring(0, partial.length-1);
        }
        let foundCategory = Object.keys(this.madLibChoices).find((key) => {
          return key == firstWord;
        });
        if (foundCategory !== undefined) {
          let word = this.madLibChoices[foundCategory][0].word;
          this.madLibChoices[foundCategory].splice(0, 1);
          finishedMadLib = finishedMadLib.concat(partial.replace(firstWord, word.toLowerCase()));
        } else {
          finishedMadLib = finishedMadLib.concat(partial);
        }
      });

      // Console log the resulting mad lib.
      const dialogRef = this.waitingDialog.open(WaitingDialog, {
        width: '250px',
        data: {
          reason: "other players",
          timer: this.timer
        }
      });
      dialogRef.disableClose = true;
      
      let votingStateObject = {
        error: "awaiting-submissions-error"
      };
      while (votingStateObject.error !== undefined) {
        // Wait for one second between requests.
        await new Promise(f => setTimeout(f, 1000));
        
        try {
          // Request the voting state.
          await this.api.post({
            sessieid: this.gameData.sessieid,
            nickname: this.store.getPlayerName(),
            playerid: this.store.getPlayerId(),
            madlib: finishedMadLib,
            voteable: voteable
          }, "submit").then((result: any) => {
            votingStateObject = result;
          });
        } catch(exception) {
          let snackBarRef = this.snackBar.open("" + exception, 'Sorry', { duration: 5000 });
        }
      }

      this.store.setVotingState(votingStateObject);
      dialogRef.close();
      this.router.navigate([ "vote" ]);
    }
  }
}