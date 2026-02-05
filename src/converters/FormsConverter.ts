import { GoogleForm, FormItem, FormResponse, Question, ChoiceQuestion } from '../services/FormsService';

export class FormsConverter {
    /**
     * Convert Google Form to Markdown
     */
    static toMarkdown(form: GoogleForm): string {
        const lines: string[] = [];

        // Title and description
        lines.push(`# ${form.info.title}`);
        lines.push('');

        if (form.info.description) {
            lines.push(`*${form.info.description}*`);
            lines.push('');
        }

        // Form link
        if (form.responderUri) {
            lines.push(`[Open Form](${form.responderUri})`);
            lines.push('');
        }

        lines.push('---');
        lines.push('');

        // Questions
        lines.push('## Questions');
        lines.push('');

        let questionNum = 1;
        for (const item of form.items) {
            const questionMd = this.convertFormItem(item, questionNum);
            if (questionMd) {
                lines.push(questionMd);
                lines.push('');
                questionNum++;
            }
        }

        return lines.join('\n');
    }

    /**
     * Convert a single form item to Markdown
     */
    private static convertFormItem(item: FormItem, questionNum: number): string {
        const lines: string[] = [];

        // Handle different item types
        if (item.questionItem) {
            const question = item.questionItem.question;
            const required = question.required ? ' **(Required)**' : '';

            lines.push(`### ${questionNum}. ${item.title || 'Untitled Question'}${required}`);

            if (item.description) {
                lines.push(`*${item.description}*`);
            }

            // Question type and options
            const typeInfo = this.getQuestionTypeInfo(question);
            lines.push(`Type: ${typeInfo.type}`);
            lines.push('');

            if (typeInfo.options.length > 0) {
                lines.push('Options:');
                for (const option of typeInfo.options) {
                    lines.push(`- [ ] ${option}`);
                }
            }

        } else if (item.questionGroupItem) {
            // Grid or grouped questions
            lines.push(`### ${questionNum}. ${item.title || 'Question Group'}`);

            if (item.description) {
                lines.push(`*${item.description}*`);
            }

            for (const question of item.questionGroupItem.questions) {
                const typeInfo = this.getQuestionTypeInfo(question);
                lines.push(`- ${typeInfo.type}`);
            }

        } else if (item.textItem) {
            // Section text
            if (item.title) {
                lines.push(`**${item.title}**`);
            }
            if (item.description) {
                lines.push(item.description);
            }

        } else if (item.pageBreakItem) {
            lines.push('---');
            if (item.title) {
                lines.push(`## ${item.title}`);
            }

        } else if (item.imageItem) {
            lines.push(`![${item.imageItem.image.altText || 'Image'}](${item.imageItem.image.contentUri || item.imageItem.image.sourceUri})`);

        } else if (item.videoItem) {
            if (item.videoItem.video.youtubeUri) {
                lines.push(`[Video](${item.videoItem.video.youtubeUri})`);
            }
            if (item.videoItem.caption) {
                lines.push(`*${item.videoItem.caption}*`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Get question type and options
     */
    private static getQuestionTypeInfo(question: Question): { type: string; options: string[] } {
        if (question.textQuestion) {
            return {
                type: question.textQuestion.paragraph ? 'Long Answer' : 'Short Answer',
                options: []
            };
        }

        if (question.choiceQuestion) {
            const typeMap: { [key: string]: string } = {
                'RADIO': 'Multiple Choice',
                'CHECKBOX': 'Checkboxes',
                'DROP_DOWN': 'Dropdown'
            };
            return {
                type: typeMap[question.choiceQuestion.type] || 'Choice',
                options: question.choiceQuestion.options.map(o =>
                    o.isOther ? 'Other...' : o.value
                )
            };
        }

        if (question.scaleQuestion) {
            const low = question.scaleQuestion.lowLabel || question.scaleQuestion.low.toString();
            const high = question.scaleQuestion.highLabel || question.scaleQuestion.high.toString();
            return {
                type: `Scale (${low} - ${high})`,
                options: []
            };
        }

        if (question.dateQuestion) {
            let type = 'Date';
            if (question.dateQuestion.includeTime) type += ' + Time';
            return { type, options: [] };
        }

        if (question.timeQuestion) {
            return {
                type: question.timeQuestion.duration ? 'Duration' : 'Time',
                options: []
            };
        }

        if (question.fileUploadQuestion) {
            return {
                type: 'File Upload',
                options: question.fileUploadQuestion.types || []
            };
        }

        return { type: 'Unknown', options: [] };
    }

    /**
     * Convert form responses to Markdown table
     */
    static responsesToMarkdown(form: GoogleForm, responses: FormResponse[]): string {
        const lines: string[] = [];

        lines.push(`# Responses: ${form.info.title}`);
        lines.push('');
        lines.push(`Total responses: ${responses.length}`);
        lines.push('');

        if (responses.length === 0) {
            lines.push('*No responses yet*');
            return lines.join('\n');
        }

        // Build header row with question titles
        const questionMap = new Map<string, string>();
        const questionIds: string[] = [];

        for (const item of form.items) {
            if (item.questionItem?.question) {
                const qId = item.questionItem.question.questionId;
                questionMap.set(qId, item.title || 'Untitled');
                questionIds.push(qId);
            }
        }

        // Create table header
        const headers = ['Timestamp', ...questionIds.map(id => questionMap.get(id) || id)];
        lines.push(`| ${headers.join(' | ')} |`);
        lines.push(`| ${headers.map(() => '---').join(' | ')} |`);

        // Add response rows
        for (const response of responses) {
            const row: string[] = [];

            // Timestamp
            row.push(new Date(response.lastSubmittedTime).toLocaleString());

            // Answers
            for (const qId of questionIds) {
                const answer = response.answers[qId];
                if (answer?.textAnswers?.answers) {
                    const answerText = answer.textAnswers.answers
                        .map(a => a.value)
                        .join(', ')
                        .replace(/\|/g, '\\|')
                        .replace(/\n/g, ' ');
                    row.push(answerText);
                } else if (answer?.fileUploadAnswers?.answers) {
                    const fileNames = answer.fileUploadAnswers.answers
                        .map(a => a.fileName)
                        .join(', ');
                    row.push(fileNames);
                } else {
                    row.push('');
                }
            }

            lines.push(`| ${row.join(' | ')} |`);
        }

        return lines.join('\n');
    }

    /**
     * Generate form summary statistics
     */
    static generateSummary(form: GoogleForm, responses: FormResponse[]): string {
        const lines: string[] = [];

        lines.push(`# Form Summary: ${form.info.title}`);
        lines.push('');
        lines.push(`- Total Questions: ${form.items.filter(i => i.questionItem).length}`);
        lines.push(`- Total Responses: ${responses.length}`);
        lines.push('');

        if (responses.length === 0) {
            return lines.join('\n');
        }

        lines.push('## Response Summary');
        lines.push('');

        for (const item of form.items) {
            if (!item.questionItem) continue;

            const question = item.questionItem.question;
            const qId = question.questionId;

            lines.push(`### ${item.title || 'Untitled'}`);
            lines.push('');

            // Collect answers
            const answers: string[] = [];
            for (const response of responses) {
                const answer = response.answers[qId];
                if (answer?.textAnswers?.answers) {
                    answers.push(...answer.textAnswers.answers.map(a => a.value));
                }
            }

            // For choice questions, show counts
            if (question.choiceQuestion) {
                const counts = new Map<string, number>();
                for (const option of question.choiceQuestion.options) {
                    counts.set(option.value, 0);
                }
                for (const answer of answers) {
                    counts.set(answer, (counts.get(answer) || 0) + 1);
                }

                for (const [option, count] of counts.entries()) {
                    const percent = responses.length > 0
                        ? Math.round((count / responses.length) * 100)
                        : 0;
                    lines.push(`- ${option}: ${count} (${percent}%)`);
                }
            } else {
                // For text questions, show sample answers
                const uniqueAnswers = [...new Set(answers)];
                lines.push(`Responses: ${answers.length}`);
                if (uniqueAnswers.length <= 5) {
                    for (const answer of uniqueAnswers) {
                        lines.push(`- "${answer}"`);
                    }
                } else {
                    lines.push(`- "${uniqueAnswers[0]}"`);
                    lines.push(`- "${uniqueAnswers[1]}"`);
                    lines.push(`- ... and ${uniqueAnswers.length - 2} more`);
                }
            }

            lines.push('');
        }

        return lines.join('\n');
    }
}
