let fieldData, contestants = {}, singleQuestion = {};
const jebaitedAPIToken = '{{token}}', //from settings
    jebaitedAPI = new Jebaited(jebaitedAPIToken);


const checkPrivileges = (data) => {
    let required = fieldData.privileges;
    let userState = {
        'mod': parseInt(data.tags.mod),
        'sub': parseInt(data.tags.subscriber),
        'vip': (data.tags.badges.indexOf("vip") !== -1),
        'badges': {
            'broadcaster': (data.userId === data.tags['room-id']),
        }
    };
    if (userState.badges.broadcaster) return true;
    else if (required === "mods" && userState.mod) return true;
    else if (required === "vips" && (userState.mod || userState.vip)) return true;
    else if (required === "subs" && (userState.mod || userState.vip || userState.sub)) return true;
    else if (required === "everybody") return true;
    else return false;
};

const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
const getQuestion = (difficulty) => {
    return new Promise(resolve => {
        let url = `https://opentdb.com/api.php?amount=1&category=${fieldData['category']}&difficulty=${difficulty}&type=multiple&encode=url3986`;
        if (fieldData['category'] === "any") url = `https://opentdb.com/api.php?amount=1&difficulty=${difficulty}&type=multiple&encode=url3986`;
        fetch(url).then(response => response.json()).then(questionData => {
            for (let i in questionData.results[0]) {
                if (i === "incorrect_answers") {
                    for (let j in questionData.results[0][i]) {
                        questionData.results[0][i][j] = decodeURIComponent(questionData.results[0][i][j]);
                    }
                } else {
                    questionData.results[0][i] = decodeURIComponent(questionData.results[0][i]);
                }
            }
            //console.log(`Correct one is `, questionData.results[0]['correct_answer'])
            questionData.results[0]['answers'] = [...questionData.results[0]['incorrect_answers'], ...[questionData.results[0]['correct_answer']]];
            shuffleArray(questionData.results[0]['answers']);
            resolve(questionData.results[0]);
        })
    })
};
const wrapText = (message, data) => {
    let answers = `A : ${data.answers[0]} | B : ${data.answers[1]} | C : ${data.answers[2]} | D : ${data.answers[3]}`;

    return message.replace("{name}", data.name)
        .replace("{user}", data.name)
        .replace("{stake}", data.stake)
        .replace("{reward}", data.reward)
        .replace("{amount}", data.reward)
        .replace("{difficulty}", data.difficulty)
        .replace("{question}", data.question)
        .replace("{answers}", answers)
        .replace("{answer}", data.correct_answer);
};
const startListener = () => {
    window.addEventListener('onEventReceived', function (obj) {
        if (obj.detail.listener !== "message") return;
        const data = obj.detail.event.data;
        const user = data["displayName"];
        const message = data["text"];
        if (message.startsWith(fieldData.questionCommand)) {
            const params = message.split(" ");

            let difficulty = params[1];
            if (difficulty !== "hard" && difficulty !== "medium") difficulty = "easy";
            let stake = parseInt(params[2]);
            if (!stake) stake = 100;
            if (stake > fieldData.maxBet) stake = fieldData.maxBet;
            if (fieldData.mode === "singleuser") {
                if (typeof contestants[user] !== "undefined") return;
                jebaitedAPI.getPoints(user).then((userPoints) => {


                    if (parseInt(userPoints) > stake) {
                        getQuestion(difficulty).then((questionData) => {
                                questionData['name'] = user;
                                questionData['stake'] = stake;
                                questionData['reward'] = parseInt(stake * fieldData[`${difficulty}Multiplier`]);
                                jebaitedAPI.sayMessage(wrapText(fieldData['questionText'], questionData)).then(() => {
                                    contestants[user] = questionData;
                                    contestants[user]['timeout'] = setTimeout(() => {
                                        jebaitedAPI.sayMessage(wrapText(fieldData['wrongAnswerText'], questionData)).then(() => {
                                            jebaitedAPI.addPoints(user, -stake).then(() => {
                                                delete contestants[user];
                                            });

                                        });
                                    }, fieldData['timeout'] * 1000)
                                })
                            }
                        );
                    }
                });
            } else {
                if (!checkPrivileges(data)) {
                    return;
                }
                if (typeof singleQuestion['answers'] !== "undefined") return;

                singleQuestion['answers'] = []; //placeholder
                getQuestion(difficulty).then((questionData) => {
                    questionData['name'] = user;
                    questionData['stake'] = stake;
                    questionData['reward'] = parseInt(stake * fieldData[`${difficulty}Multiplier`]);

                    jebaitedAPI.sayMessage(wrapText(fieldData['questionText'], questionData)).then(() => {
                        singleQuestion = Object.assign({}, questionData);
                        contestants = {};
                        singleQuestion['timeout'] = setTimeout(() => {
                            jebaitedAPI.sayMessage(wrapText(fieldData['wrongAnswerText'], questionData));
                            singleQuestion = {};
                        }, fieldData['timeout'] * 1000)
                    })
                });
            }

        } else if (message.startsWith(fieldData.answerCommand)) {
            let answer = message.replace(`${fieldData.answerCommand} `, "");

            if (fieldData.mode === "singleuser") {
                if (fieldData.acceptAnswers === "letter") {
                    if (answer.toLowerCase() === "a") answer = contestants[user]['answers'][0]
                    if (answer.toLowerCase() === "b") answer = contestants[user]['answers'][1]
                    if (answer.toLowerCase() === "c") answer = contestants[user]['answers'][2]
                    if (answer.toLowerCase() === "d") answer = contestants[user]['answers'][3]
                }
                if (typeof contestants[user] === "undefined") return;

                clearTimeout(contestants[user]['timeout']);
                if (contestants[user]['correct_answer'].toLowerCase() === answer.toLowerCase()) {
                    jebaitedAPI.sayMessage(wrapText(fieldData['correctAnswerText'], contestants[user])).then(() => {
                        jebaitedAPI.addPoints(user, contestants[user]['reward'] - contestants[user]['stake']).then(() => {
                            delete contestants[user];
                        });
                    })
                } else {
                    jebaitedAPI.sayMessage(wrapText(fieldData['wrongAnswerText'], contestants[user])).then(() => {
                        jebaitedAPI.addPoints(user, -contestants[user]['stake']).then(() => {
                            delete contestants[user];
                        });
                    })
                }
            } else {
                if (typeof contestants[user] !== "undefined") return;
                contestants[user] = 1;
                if (fieldData.acceptAnswers === "letter") {
                    if (answer.toLowerCase() === "a") answer = singleQuestion['answers'][0]
                    if (answer.toLowerCase() === "b") answer = singleQuestion['answers'][1]
                    if (answer.toLowerCase() === "c") answer = singleQuestion['answers'][2]
                    if (answer.toLowerCase() === "d") answer = singleQuestion['answers'][3]
                }


                if (typeof singleQuestion['answers'] !== "undefined") {
                    if (singleQuestion['correct_answer'].toLowerCase() === answer.toLowerCase()) {
                        //console.log(`User: `, user, singleQuestion);
                        clearTimeout(singleQuestion['timeout']);
                        singleQuestion['name'] = user;
                        let questionData = Object.assign({}, singleQuestion);
                        singleQuestion = {};
                        contestants = {};
                        jebaitedAPI.sayMessage(wrapText(fieldData['correctAnswerText'], questionData)).then(() => {
                            //console.log(singleQuestion);
                            jebaitedAPI.addPoints(user, questionData['reward']).then(() => {
                            });
                        })

                    }
                }
            }
        }


    });
}
window.addEventListener('onWidgetLoad', function (obj) {
    fieldData = obj.detail.fieldData;
    setTimeout(() => {
        jebaitedAPI.getAvailableScopes().then(scopes => {
            if (scopes.includes("addPoints") && scopes.includes("botMsg")) {
                startListener();
            } else {
                $("body").text('Missing scopes');
            }
        }).catch(e => {
            $("body").text(e.error);
        })
    }, obj.detail.overlay.isEditorMode ? 1500 : 200);
});
