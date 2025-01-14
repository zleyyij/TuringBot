/**
 * @file
 * Modules:
 *  - {@link notes}
 *  - Submodules: Add, Clear, Get
 *
 *  - {@link whois}
 */

import type {Collection, Db} from 'mongodb';
import * as util from '../core/util.js';
import {getWarns} from './warn.js';
import type {Snowflake, User} from 'discord.js';
import {Colors, EmbedBuilder} from 'discord.js';

interface Note {
  contents: string;
  addedBy: Snowflake;
  date: string;
}

/** The main DB structure for notes */
interface userRecord {
  // The user with notes
  user: Snowflake;
  // A list of all of their notes
  notes: Note[];
}

/** The name of the MongoFB collection where notes are stored */
const NOTE_COLLECTION_NAME = 'notes';

/**
 * @param user The user to get the DB record of
 */
async function getRecord(user: User): Promise<userRecord | null> {
  const db: Db = util.mongo.fetchValue();
  const records: Collection<userRecord> = db.collection(NOTE_COLLECTION_NAME);

  return await records.findOne({user: user.id});
}

/**
 * @param user The user to delete the record of
 */
async function deleteRecord(user: User): Promise<void> {
  const db: Db = util.mongo.fetchValue();
  const records: Collection<userRecord> = db.collection(NOTE_COLLECTION_NAME);

  await records.deleteOne({user: user.id});
}

/** The root note command group */
const notes = new util.RootModule('note', 'Add or delete notes from users', [
  util.mongo,
]);

notes.registerSubModule(
  new util.SubModule(
    'add',
    'Add a note to an user',
    [
      {
        type: util.ModuleOptionType.User,
        name: 'user',
        description: 'The user to add the note to',
        required: true,
      },
      {
        type: util.ModuleOptionType.String,
        name: 'note',
        description: 'The note to add',
        required: true,
      },
    ],
    async (args, interaction) => {
      const userArg: string = args
        .find(arg => arg.name === 'user')!
        .value!.toString();
      const user = await util.client.users.fetch(userArg);

      if (interaction.user.id === user.id) {
        return util.embed.errorEmbed('You cannot add a note for yourself');
      }

      const noteContents: string = args
        .find(arg => arg.name === 'note')!
        .value!.toString();

      const note: Note = {
        contents: noteContents,
        addedBy: interaction.user.id,
        date: util.formatDate(new Date()),
      };

      const db: Db = util.mongo.fetchValue();
      const records: Collection<userRecord> =
        db.collection(NOTE_COLLECTION_NAME);

      const record: userRecord | null = await getRecord(user);

      // The user already has notes, just append the new one and return early
      if (record !== null) {
        record.notes.push(note);

        // Updates the user Record
        await records
          .updateOne(
            {user: user.id},
            {$set: {notes: record.notes}},
            {upsert: true}
          )
          .catch(err => {
            return util.embed.errorEmbed(
              `Database call failed with error ${(err as Error).name}`
            );
          });
        return util.embed.successEmbed('Succesfully added that note');
      }

      // The stcructure sent to the DB
      const structuredRecord: userRecord = {
        user: user.id,
        notes: [note],
      };

      await records.insertOne(structuredRecord).catch(err => {
        return util.embed.errorEmbed(
          `Database call failed with erorr ${(err as Error).name}`
        );
      });

      return util.embed.successEmbed('Succesfully added that note');
    }
  )
);

notes.registerSubModule(
  new util.SubModule(
    'clear',
    'Clear the notes of an user',
    [
      {
        type: util.ModuleOptionType.User,
        name: 'user',
        description: 'The user to clear the notes of',
        required: true,
      },
    ],
    async args => {
      const userArg: string = args
        .find(arg => arg.name === 'user')!
        .value!.toString();
      const user = await util.client.users.fetch(userArg);

      const record: userRecord | null = await getRecord(user);

      // The user already has notes, just append to them and return early
      if (record === null) {
        return util.embed.errorEmbed(`\`${user.tag}\` doesn't have any notes`);
      }

      await deleteRecord(user).catch(err => {
        return util.embed.errorEmbed(
          `Database call failed with erorr ${(err as Error).name}`
        );
      });

      return util.embed.successEmbed(
        `Succesfully removed notes for \`${user.tag}\``
      );
    }
  )
);

notes.registerSubModule(
  new util.SubModule(
    'get',
    'Gets an users notes and returns them as a json',
    [
      {
        type: util.ModuleOptionType.User,
        name: 'user',
        description: 'The user to get the notes of',
        required: true,
      },
    ],
    async (args, interaction) => {
      const userArg: string = args
        .find(arg => arg.name === 'user')!
        .value!.toString();
      const user = await util.client.users.fetch(userArg);

      const record: userRecord | null = await getRecord(user);

      // The user already has notes, just append to them and return early
      if (record === null) {
        return util.embed.errorEmbed(`\`${user.tag}\` doesn't have any notes`);
      }

      // Shoves the notes into a JSON string, then into a buffer to send as an attachment
      const json: string = JSON.stringify({notes: record.notes}, null, 2);
      const file = Buffer.from(json);

      await util.replyToInteraction(interaction, {
        files: [
          {
            attachment: file,
            name: `notes_for_${user.id}_${util.formatDate(new Date())}.json`,
          },
        ],
      });
    }
  )
);

/** The root whois command definition */
const whois = new util.RootModule(
  'whois',
  'Displays information about an user',
  [util.mongo],
  [
    {
      type: util.ModuleOptionType.User,
      name: 'user',
      description: 'The user to get the info about',
      required: true,
    },
  ],
  async (args, interaction) => {
    const userArg: string = args
      .find(arg => arg.name === 'user')!
      .value!.toString();
    const member = await interaction.guild!.members.fetch(userArg).catch();

    if (member === null) {
      return util.embed.errorEmbed(
        `Couldn't find the user \`${userArg}\` in the server`
      );
    }

    // Defines base embed attributes
    const embed: EmbedBuilder = new EmbedBuilder();

    embed.setColor(Colors.DarkBlue);
    embed.setTitle(`User info for \`${member.user.tag}\``);
    embed.setThumbnail(member.displayAvatarURL());

    if (member.user.bot) {
      embed.setDescription('**Note: This is a bot account!**');
    }

    const fields = [];

    // Addd info fields
    fields.push({
      name: 'Created at',
      value: util.formatDate(member.user.createdAt),
      inline: true,
    });
    fields.push({
      name: 'Joined at',
      value: util.formatDate(member.joinedAt!),
      inline: true,
    });
    fields.push({
      name: 'Status',
      value: member.presence?.status ?? 'offline',
      inline: true,
    });
    fields.push({name: 'Nickname', value: member.displayName, inline: true});
    let roles: string = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .map(role => role.name)
      .join(', ');

    if (roles === '') {
      roles = 'None';
    }
    fields.push({name: 'Roles', value: roles, inline: true});

    // Handling for warns if the invoker is able to kick members
    if (interaction.memberPermissions!.has('KickMembers')) {
      const warnings = await getWarns(member.id);

      for (const warning of warnings) {
        const author: User | undefined = util.client.users.cache.get(
          warning.author
        );
        fields.push({
          name: `Warning from ${author?.username ?? warning.author} at ${
            warning.date
          }`,
          value: warning.reason,
          inline: false,
        });
      }
    }

    // Handling for notes
    const record: userRecord | null = await getRecord(member.user);
    let noteCount = 0;

    if (record !== null) {
      // Iterate through all notes and add them to the embed
      for (const note of record.notes) {
        noteCount++;

        const noteAuthor: User = await util.client.users.fetch(note.addedBy);

        fields.push({
          name: `Note from ${noteAuthor.username} at ${note.date}`,
          value: `*${note.contents}*`,
          inline: false,
        });
      }
    }

    embed.setFooter({text: `${noteCount} total notes`});
    embed.setFields(fields);

    await util.replyToInteraction(interaction, {embeds: [embed]});
  }
);

export default [notes, whois];
