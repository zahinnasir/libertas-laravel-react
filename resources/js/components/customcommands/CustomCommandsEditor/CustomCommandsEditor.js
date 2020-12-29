import React, { useContext, useEffect, useState } from 'react';
import Editor from '../../common/editor/Editor/Editor';
import {
    AUTO_ROLE_FIELD,
    COMMAND_FIELD,
    DEFAULT_EMBED_FIELDS,
    PERMISSION_FIELD,
    DISPLAY_HELP_FIELD,
    COOLDOWN_FIELD
} from '../../../utils/configs/fieldConfigs';
import {
    addField,
    clearForm,
    createFieldNames,
    initiateFields,
    isFieldActive,
    toggleField,
} from '../../../utils/editorHelpers';
import CustomCommandsFields from '../fields/CustomCommandFields/CustomCommandFields';
import CustomCommandElementFields from '../fields/CustomCommandElementFields/CustomCommandElementFields';
import EditorPanel from '../../common/editor/EditorPanel/EditorPanel';
import { CommandTypes } from '../../../pages/CustomCommands/commandTypes';
import ConfigContext from '../../../context/ConfigContext';
import { ajaxPost } from '../../../utils/FetchWrapper/FetchWrapper';
import { defaultFormHandler } from '../../../utils/FormHandler/EmbedFormHandler';
import { transformCommand } from '../../../utils/BackendTransformer/Transformer';
import { validate } from './Validations';

export default function CustomCommandsEditor({
    editorValues,
    setEditorValues,
    activePanel,
    entries,
    setEntries,
    selectedConfig,
    setEditorConfig,
    deleteEntry,
    staticFields,
    setStaticFields,
}) {
    const { config } = useContext(ConfigContext);
    const [currentValues, setCurrentValues] = useState(editorValues[0]);
    const [activeFieldNames, setActiveFieldNames] = useState([]);
    const [validationIssues, setValidationIssues] = useState([]);
    const [fieldNames, setFieldNames] = useState([]);
    const [embedIndex, setEmbedIndex] = useState(0);
    const [submissionStatus, setSubmissionStatus] = useState(null);

    const fieldsToKeepInSync = [
        {
            name: 'commandId',
        },
    ];

    const setFieldValues = (values, i) => {
        const clone = [...editorValues];
        clone[i] = values;
        if (Array.isArray(config.fieldsToKeepInSync)) {
            config.fieldsToKeepInSync.forEach((field) => {
                clone.forEach((x) => {
                    // eslint-disable-next-line no-param-reassign
                    x[field.name] = values[field.name];
                });
            });
        }
        setEditorValues(clone);
    };

    const setValuesForCurrentCommand = (values) => {
        setFieldValues(values, embedIndex);
    };

    useEffect(() => {
        setCurrentValues(editorValues[embedIndex]);
    }, [embedIndex, editorValues]);

    useEffect(() => {
        // eslint-disable-next-line max-len
        const customCommandsFields = [COMMAND_FIELD, PERMISSION_FIELD, AUTO_ROLE_FIELD, ...DEFAULT_EMBED_FIELDS];
        const currentFieldNames = createFieldNames(customCommandsFields);
        setFieldNames(currentFieldNames);
    }, [activePanel, currentValues]);

    useEffect(() => {
        setEmbedIndex(0);
    }, [activePanel]);

    useEffect(() => {
        setActiveFieldNames(initiateFields(fieldNames, currentValues));
    }, [fieldNames, currentValues]);

    const isFieldActiveListener = (fieldName) => isFieldActive(activeFieldNames, fieldName);

    const toggleFieldListener = (fieldName) => {
        toggleField(fieldName,
            activeFieldNames,
            setActiveFieldNames,
            currentValues,
            (values) => setFieldValues(values, embedIndex));
    };

    const addFieldListener = () => {
        addField(currentValues, (values) => setFieldValues(values, embedIndex));
    };

    const getActivePanelComponent = () => {
        const fieldsComponent = (
            <CustomCommandsFields
                values={currentValues}
                isFieldActive={isFieldActiveListener}
                setValues={setValuesForCurrentCommand}
                validationIssues={validationIssues}
                activePanel={activePanel}
                light={!!deleteEntry}
                staticFields={staticFields}
                setStaticFields={setStaticFields}
            />
        );
        const elementFieldsComponent = (
            <CustomCommandElementFields
                values={currentValues}
                addField={addFieldListener}
                isFieldActive={isFieldActiveListener}
                toggleField={toggleFieldListener}
            />
        );
        let multi = true;
        if (staticFields.type === CommandTypes.SINGLE || activePanel === CommandTypes.SINGLE) {
            multi = false;
        }
        if (activePanel || deleteEntry) {
            return (
                <EditorPanel
                    elementFieldsComponent={elementFieldsComponent}
                    fieldsComponent={fieldsComponent}
                    values={currentValues}
                    fieldsToKeepInSync={fieldsToKeepInSync}
                    multi={multi}
                    activeFieldNames={activeFieldNames}
                    embedIndex={embedIndex}
                    setEmbedIndex={setEmbedIndex}
                    embedValues={editorValues}
                    setEmbedValues={setEditorValues}
                    activePanel={activePanel || staticFields.type}
                />
            );
        }
        return null;
    };

    const commandFormHandler = (currentConfig, fieldValues) => {
        const formData = new FormData();
        formData.set('_token', currentConfig.csrfToken);
        formData.set('type', selectedConfig?.type || staticFields.type);
        formData.set('id', selectedConfig?.id || staticFields.id || '0');
        formData.set('name', staticFields.commandName);
        formData.set('prefix', staticFields.commandPrefix);

        currentConfig.staticFields.forEach((configField) => {
            if (configField.formDataHandler === undefined
                || staticFields[configField.name] === undefined
                || staticFields[configField.name].name === 'No Specific Channel') {
                return;
            }

            const values = configField.formDataHandler(staticFields[configField.name]);
            values.forEach((formValue, i) => {
                if (typeof formValue[1] === 'object') {
                    formData.append(`${formValue[0]}[0]`, formValue[1]);
                } else {
                    formData.append(`${formValue[0]}`, formValue[1]);
                }
            });
        });

        defaultFormHandler(fieldValues, currentConfig, formData);

        return formData;
    };

    const submitForm = (e) => {
        e.preventDefault();
        const formData = commandFormHandler(config, editorValues) || new FormData();
        let actionUrl = `/api/plugins/${config.guildId}/custom-commands`;

        if (editorValues[0].id !== undefined) {
            formData.set('_method', 'PUT');
            actionUrl += `/${editorValues[0].id}`;
        }

        ajaxPost(actionUrl, config.csrfToken, formData)
            .then((response) => {
                if (response.status !== 200) {
                    return 'error';
                }
                return response.text();
            })
            .then((status) => {
                setSubmissionStatus(status);
                setTimeout(() => setSubmissionStatus(undefined), 5000);

                if (!['OK', 'error'].includes(status.toString())) {
                    let newEntry;
                    try {
                        newEntry = JSON.parse(status.toString());
                    } catch (exception) {
                        return;
                    }

                    if (config.createEntrySuccessCallBack !== undefined) {
                        config.createEntrySuccessCallBack(config, newEntry[0].id);
                    }

                    setEntries([...entries, transformCommand(newEntry[0])]);
                    setEditorConfig(undefined);
                    setEmbedIndex(0);
                    // setEditorValues([{}]);
                }
            });
    };

    const performSubmission = (e) => {
        e.preventDefault();
        let issues = [];
        issues = validate({ ...currentValues, ...staticFields });
        setValidationIssues(issues);
        if (issues.length === 0) {
            submitForm(e);
        }
    };

    const resetForm = () => {
        clearForm(currentValues, fieldNames, setValuesForCurrentCommand);
        setStaticFields({
            messageType: ['server_message'],
            commandPrefix: '!',
            roleAction: true,
            displayHelp: DISPLAY_HELP_FIELD.options[1],
            cooldown: {
                cooldown: COOLDOWN_FIELD.options[0],
            },
        });
    };

    return (
        <>
            {!deleteEntry
                ? (
                    <Editor
                        values={currentValues}
                        activePanelComponent={getActivePanelComponent()}
                        performSubmission={performSubmission}
                        resetForm={resetForm}
                        submissionStatus={submissionStatus}
                    />
                )
                : (
                    <Editor
                        values={currentValues}
                        activePanelComponent={getActivePanelComponent()}
                        performSubmission={performSubmission}
                        deleteData={deleteEntry}
                        submissionStatus={submissionStatus}
                    />
                )}
        </>
    );
}
