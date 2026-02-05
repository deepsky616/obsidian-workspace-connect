import { GoogleApiService } from './GoogleApiService';
import WorkspaceConnectPlugin from '../../main';

export interface GoogleForm {
    formId: string;
    info: {
        title: string;
        description?: string;
        documentTitle?: string;
    };
    items: FormItem[];
    responderUri?: string;
    linkedSheetId?: string;
}

export interface FormItem {
    itemId: string;
    title?: string;
    description?: string;
    questionItem?: QuestionItem;
    questionGroupItem?: QuestionGroupItem;
    pageBreakItem?: any;
    textItem?: any;
    imageItem?: ImageItem;
    videoItem?: VideoItem;
}

export interface QuestionItem {
    question: Question;
    image?: ImageItem;
}

export interface Question {
    questionId: string;
    required?: boolean;
    choiceQuestion?: ChoiceQuestion;
    textQuestion?: TextQuestion;
    scaleQuestion?: ScaleQuestion;
    dateQuestion?: DateQuestion;
    timeQuestion?: TimeQuestion;
    fileUploadQuestion?: FileUploadQuestion;
}

export interface ChoiceQuestion {
    type: 'RADIO' | 'CHECKBOX' | 'DROP_DOWN';
    options: { value: string; isOther?: boolean }[];
    shuffle?: boolean;
}

export interface TextQuestion {
    paragraph?: boolean;
}

export interface ScaleQuestion {
    low: number;
    high: number;
    lowLabel?: string;
    highLabel?: string;
}

export interface DateQuestion {
    includeTime?: boolean;
    includeYear?: boolean;
}

export interface TimeQuestion {
    duration?: boolean;
}

export interface FileUploadQuestion {
    folderId?: string;
    maxFiles?: number;
    maxFileSize?: string;
    types?: string[];
}

export interface QuestionGroupItem {
    questions: Question[];
    image?: ImageItem;
    grid?: {
        columns: ChoiceQuestion;
        shuffleQuestions?: boolean;
    };
}

export interface ImageItem {
    image: {
        contentUri?: string;
        altText?: string;
        sourceUri?: string;
    };
}

export interface VideoItem {
    video: {
        youtubeUri?: string;
    };
    caption?: string;
}

export interface FormResponse {
    responseId: string;
    createTime: string;
    lastSubmittedTime: string;
    respondentEmail?: string;
    answers: {
        [questionId: string]: Answer;
    };
}

export interface Answer {
    questionId: string;
    textAnswers?: {
        answers: { value: string }[];
    };
    fileUploadAnswers?: {
        answers: { fileId: string; fileName: string; mimeType: string }[];
    };
}

export class FormsService extends GoogleApiService {
    constructor(plugin: WorkspaceConnectPlugin) {
        super(plugin);
    }

    async getForm(formId: string): Promise<GoogleForm> {
        return await this.get(`https://forms.googleapis.com/v1/forms/${formId}`);
    }

    async getFormResponses(formId: string): Promise<FormResponse[]> {
        const response = await this.get(`https://forms.googleapis.com/v1/forms/${formId}/responses`);
        return response.responses || [];
    }

    async createForm(title: string, description?: string): Promise<string> {
        const response = await this.post('https://forms.googleapis.com/v1/forms', {
            info: {
                title,
                documentTitle: title
            }
        });

        const formId = response.formId;

        // Add description if provided
        if (description) {
            await this.post(`https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`, {
                requests: [{
                    updateFormInfo: {
                        info: {
                            description
                        },
                        updateMask: 'description'
                    }
                }]
            });
        }

        return formId;
    }

    async addQuestion(
        formId: string,
        title: string,
        questionType: 'SHORT_ANSWER' | 'PARAGRAPH' | 'MULTIPLE_CHOICE' | 'CHECKBOXES' | 'DROPDOWN' | 'SCALE',
        options?: { choices?: string[]; required?: boolean; low?: number; high?: number }
    ): Promise<string> {
        let question: any = {};

        switch (questionType) {
            case 'SHORT_ANSWER':
                question = { textQuestion: { paragraph: false } };
                break;
            case 'PARAGRAPH':
                question = { textQuestion: { paragraph: true } };
                break;
            case 'MULTIPLE_CHOICE':
                question = {
                    choiceQuestion: {
                        type: 'RADIO',
                        options: options?.choices?.map(c => ({ value: c })) || []
                    }
                };
                break;
            case 'CHECKBOXES':
                question = {
                    choiceQuestion: {
                        type: 'CHECKBOX',
                        options: options?.choices?.map(c => ({ value: c })) || []
                    }
                };
                break;
            case 'DROPDOWN':
                question = {
                    choiceQuestion: {
                        type: 'DROP_DOWN',
                        options: options?.choices?.map(c => ({ value: c })) || []
                    }
                };
                break;
            case 'SCALE':
                question = {
                    scaleQuestion: {
                        low: options?.low || 1,
                        high: options?.high || 5
                    }
                };
                break;
        }

        question.required = options?.required || false;

        const response = await this.post(`https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`, {
            requests: [{
                createItem: {
                    item: {
                        title,
                        questionItem: {
                            question
                        }
                    },
                    location: {
                        index: 0
                    }
                }
            }]
        });

        return response.replies?.[0]?.createItem?.itemId || '';
    }

    getQuestionTypeLabel(question: Question): string {
        if (question.textQuestion) {
            return question.textQuestion.paragraph ? 'Long Answer' : 'Short Answer';
        }
        if (question.choiceQuestion) {
            switch (question.choiceQuestion.type) {
                case 'RADIO': return 'Multiple Choice';
                case 'CHECKBOX': return 'Checkboxes';
                case 'DROP_DOWN': return 'Dropdown';
            }
        }
        if (question.scaleQuestion) return 'Scale';
        if (question.dateQuestion) return 'Date';
        if (question.timeQuestion) return 'Time';
        if (question.fileUploadQuestion) return 'File Upload';

        return 'Unknown';
    }
}
